const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const adminAuth = require('../middleware/adminAuth');

// Apply admin authentication to all routes
router.use(adminAuth);

// Dashboard
router.get('/dashboard/stats', adminController.getDashboardStats);
router.get('/dashboard/revenue', adminController.getRevenueStats);

// Users
router.get('/users', adminController.getAllUsers);
router.get('/users/search', adminController.searchUsers);
router.get('/users/:userId', adminController.getUserById);
router.put('/users/:userId/subscription', adminController.updateUserSubscription);
router.post('/users/:userId/reset-trial', adminController.resetUserTrial);
router.delete('/users/:userId', adminController.deleteUser);

// Payments
router.get('/payments', adminController.getAllPayments);
router.get('/payments/:paymentId', adminController.getPaymentById);

// Payment Transactions (new endpoints for payment tracking)
router.get('/transactions', adminController.getPaymentTransactions);
router.get('/transactions/stats', adminController.getPaymentStats);
router.post('/transactions/:paymentId/mark-key-sent', adminController.markKeySent);

// Analytics endpoints for charts
router.get('/analytics/user-growth', adminController.getUserGrowth);
router.get('/analytics/subscription-distribution', adminController.getSubscriptionDistribution);
router.get('/analytics/revenue', adminController.getRevenueAnalytics);
router.get('/analytics/plan-distribution', adminController.getPlanDistribution);

module.exports = router;
