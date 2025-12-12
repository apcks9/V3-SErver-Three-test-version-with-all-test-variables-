const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const User = require('../models/User');
const Payment = require('../models/Payment');

// Get Stripe configuration (publishable key)
exports.getStripeConfig = async (req, res, next) => {
  try {
    res.status(200).json({
      success: true,
      data: {
        publishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
        environment: process.env.NODE_ENV || 'development'
      }
    });
  } catch (error) {
    next(error);
  }
};

// Create or get user
exports.createOrGetUser = async (req, res, next) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Name, email, and password are required'
      });
    }

    // Validate password length
    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        error: 'Password must be at least 6 characters long'
      });
    }

    // Check if user exists
    let user = await User.findOne({ email: email.toLowerCase() });

    if (user) {
      return res.status(200).json({
        success: true,
        data: {
          userId: user._id,
          name: user.name,
          email: user.email,
          subscriptionStatus: user.subscriptionStatus,
          queriesUsed: user.queriesUsed,
          queriesLimit: user.queriesLimit,
          lockoutUntil: user.lockoutUntil,
          remainingQueries: user.getRemainingQueries()
        }
      });
    }

    // Create new user (password will be hashed automatically by pre-save hook)
    user = await User.create({
      name,
      email: email.toLowerCase(),
      password
    });

    res.status(201).json({
      success: true,
      data: {
        userId: user._id,
        name: user.name,
        email: user.email,
        subscriptionStatus: user.subscriptionStatus,
        queriesUsed: user.queriesUsed,
        queriesLimit: user.queriesLimit,
        remainingQueries: user.getRemainingQueries()
      }
    });
  } catch (error) {
    next(error);
  }
};

// Get user status
exports.getUserStatus = async (req, res, next) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    res.status(200).json({
      success: true,
      data: {
        userId: user._id,
        name: user.name,
        email: user.email,
        subscriptionStatus: user.subscriptionStatus,
        subscriptionPlan: user.subscriptionPlan,
        queriesUsed: user.queriesUsed,
        queriesLimit: user.queriesLimit,
        lockoutUntil: user.lockoutUntil,
        remainingQueries: user.getRemainingQueries(),
        canQuery: user.canQuery()
      }
    });
  } catch (error) {
    next(error);
  }
};

// Create checkout session for subscription or one-time payment
exports.createCheckoutSession = async (req, res, next) => {
  try {
    const { userId, plan, email } = req.body; // plan: 'monthly', 'yearly', or 'lifetime'

    if (!plan) {
      return res.status(400).json({
        success: false,
        error: 'plan is required'
      });
    }

    let user;
    let customerId;

    // If userId provided, find user by ID
    if (userId) {
      user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({
          success: false,
          error: 'User not found'
        });
      }
    }
    // If email provided but no userId, find or create user
    else if (email) {
      user = await User.findOne({ email: email.toLowerCase() });
      if (!user) {
        return res.status(404).json({
          success: false,
          error: 'User not found. Please sign up first.'
        });
      }
    } else {
      return res.status(400).json({
        success: false,
        error: 'Either userId or email is required'
      });
    }

    // Get or create Stripe customer
    customerId = user.stripeCustomerId;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: user.name,
        metadata: {
          userId: user._id.toString()
        }
      });

      customerId = customer.id;
      user.stripeCustomerId = customerId;
      await user.save();
    }

    // Determine price ID and mode based on plan
    let priceId, mode;

    if (plan === 'lifetime') {
      priceId = process.env.STRIPE_ONETIME_PRICE_ID;
      mode = 'payment'; // One-time payment
    } else if (plan === 'monthly') {
      priceId = process.env.STRIPE_MONTHLY_PRICE_ID;
      mode = 'subscription'; // Recurring payment
    } else if (plan === 'yearly') {
      priceId = process.env.STRIPE_YEARLY_PRICE_ID;
      mode = 'subscription'; // Recurring payment
    } else {
      return res.status(400).json({
        success: false,
        error: 'Invalid plan. Must be "monthly", "yearly", or "lifetime"'
      });
    }

    if (!priceId) {
      return res.status(500).json({
        success: false,
        error: `Price ID not configured for ${plan} plan`
      });
    }

    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      customer: customerId, // Use customer ID (email is already associated with customer)
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: mode,
      success_url: `${process.env.BACKEND_URL}/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.BACKEND_URL}/canceled.html`,
      metadata: {
        userId: user._id.toString(),
        plan: plan
      }
    });

    res.status(200).json({
      success: true,
      data: {
        sessionId: session.id,
        url: session.url
      }
    });
  } catch (error) {
    next(error);
  }
};

// Increment query counter
exports.incrementQuery = async (req, res, next) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'userId is required'
      });
    }

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Check if user can query
    if (!user.canQuery()) {
      return res.status(403).json({
        success: false,
        error: 'Query limit reached or account locked',
        lockoutUntil: user.lockoutUntil
      });
    }

    await user.incrementQuery();

    res.status(200).json({
      success: true,
      data: {
        queriesUsed: user.queriesUsed,
        remainingQueries: user.getRemainingQueries()
      }
    });
  } catch (error) {
    next(error);
  }
};

// Handle payment decline
exports.handleDecline = async (req, res, next) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'userId is required'
      });
    }

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    user.declineCount += 1;

    // Implement lockout logic
    // First decline: 24 hours
    // Second decline: 48 hours
    // Third+ decline: 7 days
    let lockoutHours;
    if (user.declineCount === 1) {
      lockoutHours = 24;
    } else if (user.declineCount === 2) {
      lockoutHours = 48;
    } else {
      lockoutHours = 24 * 7; // 7 days
    }

    user.lockoutUntil = new Date(Date.now() + lockoutHours * 60 * 60 * 1000);
    await user.save();

    res.status(200).json({
      success: true,
      data: {
        lockoutUntil: user.lockoutUntil,
        declineCount: user.declineCount
      }
    });
  } catch (error) {
    next(error);
  }
};

// Cancel subscription
exports.cancelSubscription = async (req, res, next) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'userId is required'
      });
    }

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    if (!user.stripeSubscriptionId) {
      return res.status(400).json({
        success: false,
        error: 'No active subscription found'
      });
    }

    // Cancel the subscription in Stripe
    await stripe.subscriptions.cancel(user.stripeSubscriptionId);

    // Update user
    user.subscriptionStatus = 'canceled';
    user.stripeSubscriptionId = null;
    user.subscriptionPlan = null;
    user.queriesUsed = 0; // Reset to free trial
    await user.save();

    res.status(200).json({
      success: true,
      message: 'Subscription canceled successfully'
    });
  } catch (error) {
    next(error);
  }
};

// Get payment history
exports.getPaymentHistory = async (req, res, next) => {
  try {
    const { userId } = req.params;

    const payments = await Payment.find({ userId })
      .sort({ createdAt: -1 })
      .limit(50);

    res.status(200).json({
      success: true,
      data: payments
    });
  } catch (error) {
    next(error);
  }
};

// Sign up new user
exports.signupUser = async (req, res, next) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Name, email, and password are required'
      });
    }

    // Validate password length
    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        error: 'Password must be at least 6 characters long'
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email: email.toLowerCase() });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        error: 'User with this email already exists'
      });
    }

    // Create new user with default role 'user' (password will be hashed automatically)
    const user = await User.create({
      name,
      email: email.toLowerCase(),
      password,
      role: 'user' // Default role
    });

    res.status(201).json({
      success: true,
      data: {
        userId: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        subscriptionStatus: user.subscriptionStatus,
        queriesUsed: user.queriesUsed,
        queriesLimit: user.queriesLimit,
        remainingQueries: user.getRemainingQueries()
      },
      message: 'User account created successfully!'
    });
  } catch (error) {
    next(error);
  }
};

// Verify payment session and update subscription status
exports.verifyPaymentSession = async (req, res, next) => {
  try {
    const { sessionId } = req.body;

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        error: 'Session ID is required'
      });
    }

    // Retrieve the checkout session from Stripe
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    // Check if payment was successful
    if (session.payment_status !== 'paid') {
      return res.status(400).json({
        success: false,
        error: 'Payment not completed',
        paymentStatus: session.payment_status
      });
    }

    // Get userId and plan from session metadata
    const userId = session.metadata.userId;
    const plan = session.metadata.plan;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'User ID not found in session'
      });
    }

    // Find and update the user
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
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

    await user.save();

    // Create payment record
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

    // Log registration key if generated
    if (plan === 'lifetime' && payment.registrationKey) {
      console.log('🔑 Registration key generated for', user.email, ':', payment.registrationKey);
    }

    res.status(200).json({
      success: true,
      data: {
        userId: user._id,
        subscriptionStatus: user.subscriptionStatus,
        subscriptionPlan: user.subscriptionPlan,
        remainingQueries: user.getRemainingQueries()
      },
      message: 'Subscription activated successfully!'
    });
  } catch (error) {
    next(error);
  }
};

// Manual subscription update (for testing/admin)
exports.manualUpdateSubscription = async (req, res, next) => {
  try {
    const { userId, plan } = req.body;

    if (!userId || !plan) {
      return res.status(400).json({ success: false, error: 'userId and plan required' });
    }

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    user.subscriptionStatus = plan;
    user.subscriptionPlan = plan;
    user.subscriptionStartDate = new Date();
    user.queriesUsed = 0;

    await user.save();

    console.log('✅ Manual update:', user.email, user.subscriptionStatus);

    res.json({
      success: true,
      data: {
        userId: user._id,
        email: user.email,
        subscriptionStatus: user.subscriptionStatus,
        subscriptionPlan: user.subscriptionPlan,
        remainingQueries: user.getRemainingQueries()
      }
    });
  } catch (error) {
    console.error('Error in manual update:', error);
    next(error);
  }
};

// Login user
exports.loginUser = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Email and password are required'
      });
    }

    // Find user by email and include password field
    const user = await User.findOne({ email: email.toLowerCase() }).select('+password');

    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Invalid email or password'
      });
    }

    // Compare password
    const isPasswordValid = await user.comparePassword(password);

    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        error: 'Invalid email or password'
      });
    }

    // Return user data (without password)
    res.status(200).json({
      success: true,
      data: {
        userId: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        subscriptionStatus: user.subscriptionStatus,
        subscriptionPlan: user.subscriptionPlan,
        queriesUsed: user.queriesUsed,
        queriesLimit: user.queriesLimit,
        lockoutUntil: user.lockoutUntil,
        remainingQueries: user.getRemainingQueries(),
        canQuery: user.canQuery()
      },
      message: 'Login successful!'
    });
  } catch (error) {
    next(error);
  }
};
