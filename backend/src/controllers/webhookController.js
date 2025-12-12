const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const User = require('../models/User');
const Payment = require('../models/Payment');
const EventLog = require('../models/EventLog');

// Helper function to log events
async function logEvent(data) {
  try {
    await EventLog.create(data);
    console.log(`📝 Event logged: ${data.eventType} - ${data.status}`);
  } catch (error) {
    console.error('Failed to log event:', error.message);
  }
}

// Handle Stripe webhooks
exports.handleStripeWebhook = async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;

  // Log incoming webhook attempt
  console.log('🔔 Incoming webhook request');
  console.log('Signature present:', !!sig);
  console.log('Webhook secret configured:', !!webhookSecret);

  try {
    // Verify webhook signature
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    console.error('⚠️  Webhook signature verification failed:', err.message);

    await logEvent({
      eventType: 'webhook_signature_failed',
      source: 'stripe_webhook',
      status: 'failed',
      error: { message: err.message },
      eventData: {
        signaturePresent: !!sig,
        webhookSecretConfigured: !!webhookSecret
      }
    });

    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  console.log('✅ Webhook verified:', event.type, 'ID:', event.id);

  // Log the received webhook
  await logEvent({
    eventType: event.type,
    source: 'stripe_webhook',
    status: 'processing',
    stripeEventId: event.id,
    eventData: {
      eventType: event.type,
      eventId: event.id,
      livemode: event.livemode
    }
  });

  try {
    // Handle the event
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutSessionCompleted(event.data.object, event.id);
        break;

      case 'customer.subscription.created':
        await handleSubscriptionCreated(event.data.object, event.id);
        break;

      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object, event.id);
        break;

      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object, event.id);
        break;

      case 'invoice.paid':
        await handleInvoicePaid(event.data.object, event.id);
        break;

      case 'invoice.payment_failed':
        await handleInvoicePaymentFailed(event.data.object, event.id);
        break;

      case 'payment_intent.succeeded':
        await handlePaymentIntentSucceeded(event.data.object, event.id);
        break;

      case 'payment_intent.payment_failed':
        await handlePaymentIntentFailed(event.data.object, event.id);
        break;

      default:
        console.log(`ℹ️  Unhandled event type: ${event.type}`);
        await logEvent({
          eventType: event.type,
          source: 'stripe_webhook',
          status: 'success',
          stripeEventId: event.id,
          action: 'ignored',
          result: 'Event type not handled'
        });
    }

    res.json({ received: true });
  } catch (error) {
    console.error('❌ Error handling webhook:', error);

    await logEvent({
      eventType: event.type,
      source: 'stripe_webhook',
      status: 'failed',
      stripeEventId: event.id,
      error: {
        message: error.message,
        stack: error.stack
      }
    });

    res.status(500).json({ error: 'Webhook handler failed' });
  }
};

// Handle checkout session completed
async function handleCheckoutSessionCompleted(session, eventId) {
  console.log('🛒 Processing checkout.session.completed');
  console.log('Session ID:', session.id);
  console.log('Payment Status:', session.payment_status);
  console.log('Mode:', session.mode);
  console.log('Metadata:', JSON.stringify(session.metadata));

  let userId = session.metadata?.userId;
  let plan = session.metadata?.plan;
  let user;

  // Try to find user by userId from metadata
  if (userId) {
    user = await User.findById(userId);
    if (user) {
      console.log('✅ User found by userId:', user.email);
    }
  }

  // If no user found, try customer email
  if (!user && session.customer_email) {
    user = await User.findOne({ email: session.customer_email.toLowerCase() });
    if (user) {
      console.log('✅ User found by email:', user.email);
    }
  }

  // If still no user, try to find by stripeCustomerId
  if (!user && session.customer) {
    user = await User.findOne({ stripeCustomerId: session.customer });
    if (user) {
      console.log('✅ User found by stripeCustomerId:', user.email);
    }
  }

  if (!user) {
    console.error('❌ No user found for session');
    await logEvent({
      eventType: 'checkout.session.completed',
      source: 'stripe_webhook',
      status: 'failed',
      stripeEventId: eventId,
      stripeSessionId: session.id,
      stripeCustomerId: session.customer,
      action: 'find_user',
      result: 'User not found',
      eventData: {
        metadata: session.metadata,
        customerEmail: session.customer_email
      }
    });
    return;
  }

  // Determine plan from session if not in metadata
  if (!plan) {
    if (session.mode === 'payment') {
      plan = 'lifetime';
    } else if (session.mode === 'subscription') {
      if (session.subscription) {
        try {
          const subscription = await stripe.subscriptions.retrieve(session.subscription);
          const interval = subscription.items.data[0]?.price?.recurring?.interval;
          plan = interval === 'year' ? 'yearly' : 'monthly';
        } catch (error) {
          console.error('Error retrieving subscription:', error);
          plan = 'monthly';
        }
      } else {
        plan = 'monthly';
      }
    }
    console.log('📝 Plan determined from session mode:', plan);
  }

  // Store previous status for logging
  const previousStatus = user.subscriptionStatus;

  // Update user
  user.stripeCustomerId = session.customer;
  user.subscriptionPlan = plan;
  user.subscriptionStartDate = new Date();
  user.subscriptionStatus = plan;

  if (session.subscription) {
    user.stripeSubscriptionId = session.subscription;
  }

  user.queriesUsed = 0;
  user.lockoutUntil = null;
  user.declineCount = 0;

  await user.save();

  console.log('✅ User subscription updated:', user.email);
  console.log('   Previous status:', previousStatus);
  console.log('   New status:', user.subscriptionStatus);
  console.log('   Plan:', user.subscriptionPlan);

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
        customerEmail: session.customer_email,
        stripeEventId: eventId
      }
    });
    console.log('✅ Payment record created:', payment._id);

    if (plan === 'lifetime' && payment.registrationKey) {
      console.log('🔑 Registration key:', payment.registrationKey);
    }
  } catch (error) {
    console.error('❌ Error creating payment record:', error.message);
  }

  // Log success
  await logEvent({
    eventType: 'checkout.session.completed',
    source: 'stripe_webhook',
    status: 'success',
    stripeEventId: eventId,
    stripeSessionId: session.id,
    stripeCustomerId: session.customer,
    userId: user._id,
    userEmail: user.email,
    action: 'subscription_activated',
    result: `${previousStatus} -> ${plan}`,
    eventData: {
      plan,
      amount: session.amount_total,
      currency: session.currency
    }
  });
}

// Handle payment intent succeeded (backup for one-time payments)
async function handlePaymentIntentSucceeded(paymentIntent, eventId) {
  console.log('💰 Processing payment_intent.succeeded');
  console.log('Payment Intent ID:', paymentIntent.id);

  await logEvent({
    eventType: 'payment_intent.succeeded',
    source: 'stripe_webhook',
    status: 'success',
    stripeEventId: eventId,
    stripeCustomerId: paymentIntent.customer,
    action: 'payment_received',
    result: `Amount: ${paymentIntent.amount} ${paymentIntent.currency}`,
    eventData: {
      amount: paymentIntent.amount,
      currency: paymentIntent.currency,
      paymentIntentId: paymentIntent.id
    }
  });
}

// Handle payment intent failed
async function handlePaymentIntentFailed(paymentIntent, eventId) {
  console.log('❌ Processing payment_intent.payment_failed');

  const user = await User.findOne({ stripeCustomerId: paymentIntent.customer });

  await logEvent({
    eventType: 'payment_intent.payment_failed',
    source: 'stripe_webhook',
    status: 'success',
    stripeEventId: eventId,
    stripeCustomerId: paymentIntent.customer,
    userId: user?._id,
    userEmail: user?.email,
    action: 'payment_failed',
    result: paymentIntent.last_payment_error?.message || 'Payment failed',
    eventData: {
      amount: paymentIntent.amount,
      currency: paymentIntent.currency,
      errorMessage: paymentIntent.last_payment_error?.message
    }
  });
}

// Handle subscription created
async function handleSubscriptionCreated(subscription, eventId) {
  console.log('📋 Processing customer.subscription.created');

  const customerId = subscription.customer;
  const user = await User.findOne({ stripeCustomerId: customerId });

  if (!user) {
    console.error('User not found for customer:', customerId);
    await logEvent({
      eventType: 'customer.subscription.created',
      source: 'stripe_webhook',
      status: 'failed',
      stripeEventId: eventId,
      stripeCustomerId: customerId,
      action: 'find_user',
      result: 'User not found'
    });
    return;
  }

  const interval = subscription.items.data[0]?.price?.recurring?.interval;
  const plan = interval === 'year' ? 'yearly' : 'monthly';

  user.stripeSubscriptionId = subscription.id;
  user.subscriptionPlan = plan;
  user.subscriptionStatus = plan;
  user.subscriptionStartDate = new Date(subscription.current_period_start * 1000);
  user.subscriptionEndDate = new Date(subscription.current_period_end * 1000);

  await user.save();

  console.log('✅ Subscription created for:', user.email, 'Plan:', plan);

  await logEvent({
    eventType: 'customer.subscription.created',
    source: 'stripe_webhook',
    status: 'success',
    stripeEventId: eventId,
    stripeCustomerId: customerId,
    userId: user._id,
    userEmail: user.email,
    action: 'subscription_created',
    result: plan,
    eventData: {
      subscriptionId: subscription.id,
      plan,
      periodStart: user.subscriptionStartDate,
      periodEnd: user.subscriptionEndDate
    }
  });
}

// Handle subscription updated
async function handleSubscriptionUpdated(subscription, eventId) {
  console.log('🔄 Processing customer.subscription.updated');

  const customerId = subscription.customer;
  const user = await User.findOne({ stripeCustomerId: customerId });

  if (!user) {
    console.error('User not found for customer:', customerId);
    await logEvent({
      eventType: 'customer.subscription.updated',
      source: 'stripe_webhook',
      status: 'failed',
      stripeEventId: eventId,
      stripeCustomerId: customerId,
      action: 'find_user',
      result: 'User not found'
    });
    return;
  }

  const previousStatus = user.subscriptionStatus;

  if (['past_due', 'canceled', 'unpaid'].includes(subscription.status)) {
    user.subscriptionStatus = subscription.status;
  }

  user.subscriptionEndDate = new Date(subscription.current_period_end * 1000);
  await user.save();

  console.log('✅ Subscription updated for:', user.email, 'Status:', user.subscriptionStatus);

  await logEvent({
    eventType: 'customer.subscription.updated',
    source: 'stripe_webhook',
    status: 'success',
    stripeEventId: eventId,
    stripeCustomerId: customerId,
    userId: user._id,
    userEmail: user.email,
    action: 'subscription_updated',
    result: `${previousStatus} -> ${user.subscriptionStatus}`,
    eventData: {
      stripeStatus: subscription.status,
      periodEnd: user.subscriptionEndDate
    }
  });
}

// Handle subscription deleted/canceled
async function handleSubscriptionDeleted(subscription, eventId) {
  console.log('🚫 Processing customer.subscription.deleted');

  const customerId = subscription.customer;
  const user = await User.findOne({ stripeCustomerId: customerId });

  if (!user) {
    console.error('User not found for customer:', customerId);
    await logEvent({
      eventType: 'customer.subscription.deleted',
      source: 'stripe_webhook',
      status: 'failed',
      stripeEventId: eventId,
      stripeCustomerId: customerId,
      action: 'find_user',
      result: 'User not found'
    });
    return;
  }

  const previousStatus = user.subscriptionStatus;

  user.subscriptionStatus = 'canceled';
  user.stripeSubscriptionId = null;
  user.subscriptionPlan = null;
  user.subscriptionEndDate = new Date();
  user.queriesUsed = 0;

  await user.save();

  console.log('✅ Subscription canceled for:', user.email);

  await logEvent({
    eventType: 'customer.subscription.deleted',
    source: 'stripe_webhook',
    status: 'success',
    stripeEventId: eventId,
    stripeCustomerId: customerId,
    userId: user._id,
    userEmail: user.email,
    action: 'subscription_canceled',
    result: `${previousStatus} -> canceled`,
    eventData: {
      cancellationDate: new Date()
    }
  });
}

// Handle invoice paid
async function handleInvoicePaid(invoice, eventId) {
  console.log('🧾 Processing invoice.paid');

  const customerId = invoice.customer;
  const user = await User.findOne({ stripeCustomerId: customerId });

  if (!user) {
    console.error('User not found for customer:', customerId);
    await logEvent({
      eventType: 'invoice.paid',
      source: 'stripe_webhook',
      status: 'failed',
      stripeEventId: eventId,
      stripeCustomerId: customerId,
      action: 'find_user',
      result: 'User not found'
    });
    return;
  }

  await user.save();

  // Create payment record
  await Payment.create({
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
      periodEnd: new Date(invoice.period_end * 1000),
      stripeEventId: eventId
    }
  });

  console.log('✅ Invoice paid for:', user.email, 'Amount:', invoice.amount_paid / 100);

  await logEvent({
    eventType: 'invoice.paid',
    source: 'stripe_webhook',
    status: 'success',
    stripeEventId: eventId,
    stripeCustomerId: customerId,
    userId: user._id,
    userEmail: user.email,
    action: 'invoice_paid',
    result: `${invoice.amount_paid / 100} ${invoice.currency}`,
    eventData: {
      invoiceId: invoice.id,
      amount: invoice.amount_paid,
      currency: invoice.currency
    }
  });
}

// Handle invoice payment failed
async function handleInvoicePaymentFailed(invoice, eventId) {
  console.log('❌ Processing invoice.payment_failed');

  const customerId = invoice.customer;
  const user = await User.findOne({ stripeCustomerId: customerId });

  if (!user) {
    console.error('User not found for customer:', customerId);
    await logEvent({
      eventType: 'invoice.payment_failed',
      source: 'stripe_webhook',
      status: 'failed',
      stripeEventId: eventId,
      stripeCustomerId: customerId,
      action: 'find_user',
      result: 'User not found'
    });
    return;
  }

  user.subscriptionStatus = 'past_due';
  await user.save();

  // Create failed payment record
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
      attemptCount: invoice.attempt_count,
      stripeEventId: eventId
    }
  });

  console.log('❌ Invoice payment failed for:', user.email);

  await logEvent({
    eventType: 'invoice.payment_failed',
    source: 'stripe_webhook',
    status: 'success',
    stripeEventId: eventId,
    stripeCustomerId: customerId,
    userId: user._id,
    userEmail: user.email,
    action: 'payment_failed',
    result: `${invoice.amount_due / 100} ${invoice.currency} - Attempt ${invoice.attempt_count}`,
    eventData: {
      invoiceId: invoice.id,
      amount: invoice.amount_due,
      attemptCount: invoice.attempt_count
    }
  });
}

module.exports = exports;
