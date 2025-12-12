const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const User = require('../models/User');
const Payment = require('../models/Payment');

// Handle Stripe webhooks
exports.handleStripeWebhook = async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;

  try {
    // Verify webhook signature
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    console.error('⚠️  Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  console.log('✅ Webhook received:', event.type);

  try {
    // Handle the event
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutSessionCompleted(event.data.object);
        break;

      case 'customer.subscription.created':
        await handleSubscriptionCreated(event.data.object);
        break;

      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object);
        break;

      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object);
        break;

      case 'invoice.paid':
        await handleInvoicePaid(event.data.object);
        break;

      case 'invoice.payment_failed':
        await handleInvoicePaymentFailed(event.data.object);
        break;

      case 'customer.subscription.trial_will_end':
        await handleTrialWillEnd(event.data.object);
        break;

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    res.json({ received: true });
  } catch (error) {
    console.error('Error handling webhook:', error);
    res.status(500).json({ error: 'Webhook handler failed' });
  }
};

// Handle checkout session completed
async function handleCheckoutSessionCompleted(session) {
  console.log('Processing checkout.session.completed');
  console.log('Session data:', JSON.stringify(session, null, 2));

  let userId = session.metadata?.userId;
  let plan = session.metadata?.plan;
  let user;

  // Try to find user by userId from metadata (API checkout)
  if (userId) {
    user = await User.findById(userId);
    if (user) {
      console.log('✅ User found by userId:', user.email);
    }
  }

  // If no user found, try to find by customer email (Payment Link checkout)
  if (!user && session.customer_email) {
    user = await User.findOne({ email: session.customer_email.toLowerCase() });
    if (user) {
      console.log('✅ User found by email:', user.email);
    }
  }

  if (!user) {
    console.error('❌ No user found. UserId:', userId, 'Email:', session.customer_email);
    return;
  }

  // Determine plan from session if not in metadata
  if (!plan) {
    // Check if it's a subscription or one-time payment
    if (session.mode === 'payment') {
      plan = 'lifetime'; // One-time payment = lifetime
    } else if (session.mode === 'subscription') {
      // Get subscription details to determine monthly vs yearly
      if (session.subscription) {
        try {
          const subscription = await stripe.subscriptions.retrieve(session.subscription);
          const interval = subscription.items.data[0]?.price?.recurring?.interval;
          plan = interval === 'year' ? 'yearly' : 'monthly';
        } catch (error) {
          console.error('Error retrieving subscription:', error);
          plan = 'monthly'; // Default to monthly
        }
      } else {
        plan = 'monthly'; // Default
      }
    }
    console.log('📝 Plan determined from session:', plan);
  }

  // Update user with payment info
  user.stripeCustomerId = session.customer;
  user.subscriptionPlan = plan;
  user.subscriptionStartDate = new Date();

  // Set subscription status to the plan type (monthly, yearly, or lifetime)
  user.subscriptionStatus = plan;

  // If there's a subscription ID in the session, save it
  if (session.subscription) {
    user.stripeSubscriptionId = session.subscription;
  }

  // Reset queries for paid users
  user.queriesUsed = 0;
  user.lockoutUntil = null;
  user.declineCount = 0;

  console.log('✅ User subscription activated:', user.email, 'Plan:', plan);

  await user.save();
  console.log('✅ User saved to database. New subscription status:', user.subscriptionStatus);

  // Create payment record
  try {
    const payment = await Payment.create({
      userId: user._id,
      userEmail: user.email,
      stripePaymentIntentId: session.payment_intent,
      amount: session.amount_total,
      currency: session.currency,
      status: 'succeeded',
      paymentType: plan === 'lifetime' ? 'one_time' : 'subscription',
      subscriptionPlan: plan,
      purchaseDate: new Date(),
      metadata: {
        sessionId: session.id,
        customerEmail: session.customer_email
      }
    });
    console.log('✅ Payment record created');

    // Log registration key if it's a lifetime purchase
    if (plan === 'lifetime' && payment.registrationKey) {
      console.log('🔑 Registration key generated:', payment.registrationKey);
      console.log('📧 TODO: Send registration key to:', user.email);
    }
  } catch (error) {
    console.error('Error creating payment record:', error);
  }
}

// Handle subscription created
async function handleSubscriptionCreated(subscription) {
  console.log('Processing customer.subscription.created');

  const customerId = subscription.customer;
  const user = await User.findOne({ stripeCustomerId: customerId });

  if (!user) {
    console.error('User not found for customer:', customerId);
    return;
  }

  user.stripeSubscriptionId = subscription.id;

  // Determine plan type from subscription
  const interval = subscription.items.data[0]?.price?.recurring?.interval;
  const plan = interval === 'year' ? 'yearly' : 'monthly';
  user.subscriptionPlan = plan;

  // Set subscription status to the plan type (monthly or yearly)
  user.subscriptionStatus = plan;

  user.subscriptionStartDate = new Date(subscription.current_period_start * 1000);
  user.subscriptionEndDate = new Date(subscription.current_period_end * 1000);

  await user.save();

  console.log('✅ Subscription created for user:', user.email, 'Plan:', plan);
}

// Handle subscription updated
async function handleSubscriptionUpdated(subscription) {
  console.log('Processing customer.subscription.updated');

  const customerId = subscription.customer;
  const user = await User.findOne({ stripeCustomerId: customerId });

  if (!user) {
    console.error('User not found for customer:', customerId);
    return;
  }

  // Check if subscription status is past_due, canceled, or unpaid
  if (subscription.status === 'past_due' || subscription.status === 'canceled' || subscription.status === 'unpaid') {
    user.subscriptionStatus = subscription.status;
  }
  // Otherwise keep the plan type as the status (monthly/yearly/lifetime)

  user.subscriptionEndDate = new Date(subscription.current_period_end * 1000);

  await user.save();

  console.log('✅ Subscription updated for user:', user.email, 'Status:', user.subscriptionStatus);
}

// Handle subscription deleted/canceled
async function handleSubscriptionDeleted(subscription) {
  console.log('Processing customer.subscription.deleted');

  const customerId = subscription.customer;
  const user = await User.findOne({ stripeCustomerId: customerId });

  if (!user) {
    console.error('User not found for customer:', customerId);
    return;
  }

  user.subscriptionStatus = 'canceled';
  user.stripeSubscriptionId = null;
  user.subscriptionPlan = null;
  user.subscriptionEndDate = new Date();

  // Reset to free trial
  user.queriesUsed = 0;

  await user.save();

  console.log('✅ Subscription canceled for user:', user.email);
}

// Handle invoice paid
async function handleInvoicePaid(invoice) {
  console.log('Processing invoice.paid');

  const customerId = invoice.customer;
  const user = await User.findOne({ stripeCustomerId: customerId });

  if (!user) {
    console.error('User not found for customer:', customerId);
    return;
  }

  // Subscription status is already set (monthly/yearly/lifetime), just ensure it's saved
  await user.save();

  // Record payment
  const payment = await Payment.create({
    userId: user._id,
    userEmail: user.email,
    stripeInvoiceId: invoice.id,
    stripePaymentIntentId: invoice.payment_intent,
    amount: invoice.amount_paid,
    currency: invoice.currency,
    status: 'succeeded',
    paymentType: 'subscription',
    subscriptionPlan: user.subscriptionPlan,
    purchaseDate: new Date(),
    metadata: {
      invoiceNumber: invoice.number,
      periodStart: new Date(invoice.period_start * 1000),
      periodEnd: new Date(invoice.period_end * 1000)
    }
  });

  console.log('✅ Invoice paid for user:', user.email, 'Amount:', invoice.amount_paid / 100, invoice.currency);
}

// Handle invoice payment failed
async function handleInvoicePaymentFailed(invoice) {
  console.log('Processing invoice.payment_failed');

  const customerId = invoice.customer;
  const user = await User.findOne({ stripeCustomerId: customerId });

  if (!user) {
    console.error('User not found for customer:', customerId);
    return;
  }

  user.subscriptionStatus = 'past_due';
  await user.save();

  // Record failed payment
  await Payment.create({
    userId: user._id,
    userEmail: user.email,
    stripeInvoiceId: invoice.id,
    amount: invoice.amount_due,
    currency: invoice.currency,
    status: 'failed',
    paymentType: 'subscription',
    subscriptionPlan: user.subscriptionPlan,
    purchaseDate: new Date(),
    metadata: {
      invoiceNumber: invoice.number,
      attemptCount: invoice.attempt_count
    }
  });

  console.log('❌ Invoice payment failed for user:', user.email);
}

// Handle trial will end
async function handleTrialWillEnd(subscription) {
  console.log('Processing customer.subscription.trial_will_end');

  const customerId = subscription.customer;
  const user = await User.findOne({ stripeCustomerId: customerId });

  if (!user) {
    console.error('User not found for customer:', customerId);
    return;
  }

  // You could send an email notification here
  console.log('⚠️  Trial ending soon for user:', user.email);
}

module.exports = exports;
