const mongoose = require('mongoose');

const eventLogSchema = new mongoose.Schema({
  eventType: {
    type: String,
    required: true,
    index: true
  },
  source: {
    type: String,
    enum: ['stripe_webhook', 'api', 'system', 'admin'],
    default: 'system'
  },
  status: {
    type: String,
    enum: ['success', 'failed', 'pending', 'processing'],
    default: 'pending'
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    sparse: true
  },
  userEmail: {
    type: String,
    lowercase: true
  },
  stripeEventId: {
    type: String,
    sparse: true
  },
  stripeSessionId: {
    type: String,
    sparse: true
  },
  stripeCustomerId: {
    type: String,
    sparse: true
  },
  // What action was taken
  action: {
    type: String
  },
  // Result of the action
  result: {
    type: String
  },
  // Full event data for debugging
  eventData: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  // Error details if failed
  error: {
    message: String,
    stack: String
  },
  // Request metadata
  requestInfo: {
    ip: String,
    userAgent: String,
    origin: String
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  }
});

// Index for quick lookups
eventLogSchema.index({ eventType: 1, createdAt: -1 });
eventLogSchema.index({ userId: 1, createdAt: -1 });
eventLogSchema.index({ stripeEventId: 1 });

module.exports = mongoose.model('EventLog', eventLogSchema);
