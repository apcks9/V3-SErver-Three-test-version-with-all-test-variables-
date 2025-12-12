const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const paymentSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  // User email for easy tracking
  userEmail: {
    type: String,
    required: true,
    lowercase: true
  },
  stripePaymentIntentId: {
    type: String,
    unique: true,
    sparse: true
  },
  stripeInvoiceId: {
    type: String,
    unique: true,
    sparse: true
  },
  amount: {
    type: Number,
    required: true
  },
  currency: {
    type: String,
    default: 'usd',
    lowercase: true
  },
  status: {
    type: String,
    enum: ['pending', 'succeeded', 'failed', 'refunded'],
    default: 'pending'
  },
  paymentType: {
    type: String,
    enum: ['subscription', 'one_time'],
    default: 'subscription'
  },
  subscriptionPlan: {
    type: String,
    enum: ['monthly', 'yearly', 'lifetime', null],
    default: null
  },
  // Registration key for lifetime purchases
  registrationKey: {
    type: String,
    unique: true,
    sparse: true,
    default: null
  },
  // Track if registration key has been sent
  registrationKeySent: {
    type: Boolean,
    default: false
  },
  // When the key was sent
  registrationKeySentAt: {
    type: Date,
    default: null
  },
  // Purchase timestamp
  purchaseDate: {
    type: Date,
    default: Date.now
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Update the updatedAt timestamp before saving
paymentSchema.pre('save', function(next) {
  this.updatedAt = Date.now();

  // Auto-generate registration key for lifetime purchases if not set
  if (this.subscriptionPlan === 'lifetime' && this.status === 'succeeded' && !this.registrationKey) {
    this.registrationKey = `LT-${uuidv4().toUpperCase().substring(0, 8)}-${uuidv4().toUpperCase().substring(0, 8)}`;
  }

  next();
});

// Instance method to mark registration key as sent
paymentSchema.methods.markKeySent = function() {
  this.registrationKeySent = true;
  this.registrationKeySentAt = new Date();
  return this.save();
};

module.exports = mongoose.model('Payment', paymentSchema);
