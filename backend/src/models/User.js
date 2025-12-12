const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    required: true,
    minlength: 6,
    select: false // Don't return password in queries by default
  },
  // Stripe customer ID
  stripeCustomerId: {
    type: String,
    unique: true,
    sparse: true
  },
  // Current subscription status
  subscriptionStatus: {
    type: String,
    enum: ['free_trial', 'monthly', 'yearly', 'lifetime', 'past_due', 'canceled', 'unpaid'],
    default: 'free_trial'
  },
  // Stripe subscription ID
  stripeSubscriptionId: {
    type: String,
    sparse: true
  },
  // Free trial queries
  queriesUsed: {
    type: Number,
    default: 0
  },
  queriesLimit: {
    type: Number,
    default: 5
  },
  // Lockout tracking
  lockoutUntil: {
    type: Date,
    default: null
  },
  declineCount: {
    type: Number,
    default: 0
  },
  // Subscription details
  subscriptionPlan: {
    type: String,
    enum: ['monthly', 'yearly', 'lifetime', null],
    default: null
  },
  subscriptionStartDate: {
    type: Date,
    default: null
  },
  subscriptionEndDate: {
    type: Date,
    default: null
  },
  // User role
  role: {
    type: String,
    enum: ['user', 'admin'],
    default: 'user'
  },
  // Metadata
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Hash password before saving
userSchema.pre('save', async function(next) {
  this.updatedAt = Date.now();

  // Only hash the password if it has been modified (or is new)
  if (!this.isModified('password')) {
    return next();
  }

  try {
    // Generate salt and hash password
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Instance methods
userSchema.methods.canQuery = function() {
  // Paid users (monthly, yearly, or lifetime) can always query
  if (this.subscriptionStatus === 'monthly' ||
      this.subscriptionStatus === 'yearly' ||
      this.subscriptionStatus === 'lifetime') {
    return true;
  }

  // Free trial users: check lockout and query limit
  if (this.lockoutUntil && new Date() < this.lockoutUntil) {
    return false;
  }

  return this.queriesUsed < this.queriesLimit;
};

userSchema.methods.incrementQuery = function() {
  // Only increment for free trial users
  if (this.subscriptionStatus === 'free_trial') {
    this.queriesUsed += 1;
  }
  return this.save();
};

userSchema.methods.getRemainingQueries = function() {
  // Paid subscribers have unlimited queries
  if (this.subscriptionStatus === 'monthly' ||
      this.subscriptionStatus === 'yearly' ||
      this.subscriptionStatus === 'lifetime') {
    return 'Unlimited';
  }
  return Math.max(0, this.queriesLimit - this.queriesUsed);
};

// Method to compare password for login
userSchema.methods.comparePassword = async function(candidatePassword) {
  try {
    return await bcrypt.compare(candidatePassword, this.password);
  } catch (error) {
    throw error;
  }
};

module.exports = mongoose.model('User', userSchema);
