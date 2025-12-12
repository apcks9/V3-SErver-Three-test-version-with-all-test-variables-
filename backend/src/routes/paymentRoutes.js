const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');

// Configuration
router.get('/config', paymentController.getStripeConfig);

// User management
router.post('/users', paymentController.createOrGetUser);
router.post('/signup', paymentController.signupUser);
router.post('/login', paymentController.loginUser);
router.get('/users/:userId', paymentController.getUserStatus);

// Subscription management
router.post('/create-checkout-session', paymentController.createCheckoutSession);
router.post('/verify-payment-session', paymentController.verifyPaymentSession);
router.post('/manual-update-subscription', paymentController.manualUpdateSubscription);
router.post('/cancel-subscription', paymentController.cancelSubscription);

// Query tracking
router.post('/increment-query', paymentController.incrementQuery);
router.post('/handle-decline', paymentController.handleDecline);

// Payment history
router.get('/payments/:userId', paymentController.getPaymentHistory);

module.exports = router;
