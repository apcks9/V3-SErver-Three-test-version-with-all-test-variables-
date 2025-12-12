const express = require('express');
const router = express.Router();
const webhookController = require('../controllers/webhookController');

// Stripe webhook endpoint
// Note: This needs raw body, so it's handled specially in server.js
router.post('/stripe', webhookController.handleStripeWebhook);

module.exports = router;
