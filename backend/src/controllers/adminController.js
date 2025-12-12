const User = require('../models/User');
const Payment = require('../models/Payment');

/**
 * Admin Dashboard - Get statistics
 */
exports.getDashboardStats = async (req, res, next) => {
  try {
    // Total users count
    const totalUsers = await User.countDocuments();

    // Users by subscription status
    const usersByStatus = await User.aggregate([
      {
        $group: {
          _id: '$subscriptionStatus',
          count: { $sum: 1 }
        }
      }
    ]);

    // Total revenue (sum of successful payments)
    const revenueData = await Payment.aggregate([
      {
        $match: { status: 'succeeded' }
      },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: '$amount' },
          totalTransactions: { $sum: 1 }
        }
      }
    ]);

    // Revenue by plan
    const revenueByPlan = await Payment.aggregate([
      {
        $match: { status: 'succeeded' }
      },
      {
        $group: {
          _id: '$paymentType',
          revenue: { $sum: '$amount' },
          count: { $sum: 1 }
        }
      }
    ]);

    // Recent users (last 7 days)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const recentUsers = await User.countDocuments({
      createdAt: { $gte: sevenDaysAgo }
    });

    // Active subscriptions
    const activeSubscriptions = await User.countDocuments({
      subscriptionStatus: { $in: ['active', 'lifetime'] }
    });

    res.status(200).json({
      success: true,
      data: {
        totalUsers,
        activeSubscriptions,
        recentUsers,
        usersByStatus: usersByStatus.reduce((acc, item) => {
          acc[item._id] = item.count;
          return acc;
        }, {}),
        revenue: {
          total: revenueData[0]?.totalRevenue || 0,
          totalTransactions: revenueData[0]?.totalTransactions || 0,
          byPlan: revenueByPlan
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get all users with pagination, filtering, and sorting
 */
exports.getAllUsers = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 20,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      status,
      plan,
      search
    } = req.query;

    // Build query
    const query = {};

    // Filter by subscription status
    if (status) {
      query.subscriptionStatus = status;
    }

    // Filter by subscription plan
    if (plan) {
      query.subscriptionPlan = plan;
    }

    // Search by email or name
    if (search) {
      query.$or = [
        { email: { $regex: search, $options: 'i' } },
        { name: { $regex: search, $options: 'i' } }
      ];
    }

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const sortOptions = { [sortBy]: sortOrder === 'asc' ? 1 : -1 };

    // Get total count for pagination
    const total = await User.countDocuments(query);

    // Get users with pagination
    const users = await User.find(query)
      .sort(sortOptions)
      .skip(skip)
      .limit(parseInt(limit))
      .select('-__v')
      .lean();

    // Add computed fields
    const usersWithExtras = users.map(user => ({
      ...user,
      remainingQueries: user.subscriptionStatus === 'active' || user.subscriptionStatus === 'lifetime'
        ? 'Unlimited'
        : Math.max(0, user.queriesLimit - user.queriesUsed)
    }));

    res.status(200).json({
      success: true,
      data: {
        users: usersWithExtras,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / parseInt(limit)),
          totalUsers: total,
          perPage: parseInt(limit),
          hasNext: skip + users.length < total,
          hasPrev: parseInt(page) > 1
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get single user by ID
 */
exports.getUserById = async (req, res, next) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId).select('-__v');

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Get user's payment history
    const payments = await Payment.find({ userId })
      .sort({ createdAt: -1 })
      .limit(10)
      .select('-__v');

    res.status(200).json({
      success: true,
      data: {
        user: {
          ...user.toObject(),
          remainingQueries: user.getRemainingQueries()
        },
        recentPayments: payments
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update user subscription status
 */
exports.updateUserSubscription = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { subscriptionStatus, subscriptionPlan } = req.body;

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Update subscription
    if (subscriptionStatus) {
      user.subscriptionStatus = subscriptionStatus;
    }

    if (subscriptionPlan) {
      user.subscriptionPlan = subscriptionPlan;
    }

    await user.save();

    res.status(200).json({
      success: true,
      data: {
        user: user.toObject(),
        message: 'User subscription updated successfully'
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Reset user trial
 */
exports.resetUserTrial = async (req, res, next) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Reset trial
    user.queriesUsed = 0;
    user.queriesLimit = 5;
    user.lockoutUntil = null;
    user.declineCount = 0;
    user.subscriptionStatus = 'free_trial';

    await user.save();

    res.status(200).json({
      success: true,
      data: {
        user: user.toObject(),
        message: 'User trial reset successfully'
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete user
 */
exports.deleteUser = async (req, res, next) => {
  try {
    const { userId } = req.params;

    const user = await User.findByIdAndDelete(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Also delete user's payments
    await Payment.deleteMany({ userId });

    res.status(200).json({
      success: true,
      data: {
        message: 'User and associated payments deleted successfully'
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get all payments with pagination and filtering
 */
exports.getAllPayments = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 20,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      status,
      paymentType,
      userId
    } = req.query;

    // Build query
    const query = {};

    if (status) {
      query.status = status;
    }

    if (paymentType) {
      query.paymentType = paymentType;
    }

    if (userId) {
      query.userId = userId;
    }

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const sortOptions = { [sortBy]: sortOrder === 'asc' ? 1 : -1 };

    // Get total count
    const total = await Payment.countDocuments(query);

    // Get payments with user info
    const payments = await Payment.find(query)
      .sort(sortOptions)
      .skip(skip)
      .limit(parseInt(limit))
      .populate('userId', 'name email subscriptionStatus')
      .select('-__v')
      .lean();

    res.status(200).json({
      success: true,
      data: {
        payments,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / parseInt(limit)),
          totalPayments: total,
          perPage: parseInt(limit),
          hasNext: skip + payments.length < total,
          hasPrev: parseInt(page) > 1
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get single payment by ID
 */
exports.getPaymentById = async (req, res, next) => {
  try {
    const { paymentId } = req.params;

    const payment = await Payment.findById(paymentId)
      .populate('userId', 'name email subscriptionStatus subscriptionPlan')
      .select('-__v');

    if (!payment) {
      return res.status(404).json({
        success: false,
        error: 'Payment not found'
      });
    }

    res.status(200).json({
      success: true,
      data: payment
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get revenue statistics
 */
exports.getRevenueStats = async (req, res, next) => {
  try {
    const { period = '30d' } = req.query;

    // Calculate date range
    let startDate;
    switch (period) {
      case '7d':
        startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        break;
      case '90d':
        startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
        break;
      case '1y':
        startDate = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    }

    // Get revenue data
    const revenueData = await Payment.aggregate([
      {
        $match: {
          status: 'succeeded',
          createdAt: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$createdAt' }
          },
          revenue: { $sum: '$amount' },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { _id: 1 }
      }
    ]);

    // Total revenue for period
    const totalRevenue = revenueData.reduce((sum, day) => sum + day.revenue, 0);
    const totalTransactions = revenueData.reduce((sum, day) => sum + day.count, 0);

    res.status(200).json({
      success: true,
      data: {
        period,
        totalRevenue,
        totalTransactions,
        averageTransaction: totalTransactions > 0 ? totalRevenue / totalTransactions : 0,
        dailyRevenue: revenueData
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Search users by email
 */
exports.searchUsers = async (req, res, next) => {
  try {
    const { q } = req.query;

    if (!q) {
      return res.status(400).json({
        success: false,
        error: 'Search query is required'
      });
    }

    const users = await User.find({
      $or: [
        { email: { $regex: q, $options: 'i' } },
        { name: { $regex: q, $options: 'i' } }
      ]
    })
      .limit(10)
      .select('name email subscriptionStatus subscriptionPlan queriesUsed')
      .lean();

    res.status(200).json({
      success: true,
      data: users
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get all payment transactions for admin dashboard
 * Includes email, subscription plan, success status, date/time, registration key info
 */
exports.getPaymentTransactions = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 50,
      sortBy = 'purchaseDate',
      sortOrder = 'desc',
      status,
      plan,
      email,
      startDate,
      endDate
    } = req.query;

    // Build query
    const query = {};

    // Filter by status (succeeded, failed, pending, refunded)
    if (status) {
      query.status = status;
    }

    // Filter by subscription plan
    if (plan) {
      query.subscriptionPlan = plan;
    }

    // Filter by email
    if (email) {
      query.userEmail = { $regex: email, $options: 'i' };
    }

    // Filter by date range
    if (startDate || endDate) {
      query.purchaseDate = {};
      if (startDate) {
        query.purchaseDate.$gte = new Date(startDate);
      }
      if (endDate) {
        query.purchaseDate.$lte = new Date(endDate);
      }
    }

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const sortOptions = { [sortBy]: sortOrder === 'asc' ? 1 : -1 };

    // Get total count
    const total = await Payment.countDocuments(query);

    // Get payments
    const payments = await Payment.find(query)
      .sort(sortOptions)
      .skip(skip)
      .limit(parseInt(limit))
      .populate('userId', 'name email')
      .lean();

    // Format response
    const formattedPayments = payments.map(payment => ({
      _id: payment._id,
      email: payment.userEmail,
      userName: payment.userId?.name || 'N/A',
      subscriptionPlan: payment.subscriptionPlan || 'N/A',
      amount: payment.amount,
      currency: payment.currency,
      status: payment.status,
      isSuccessful: payment.status === 'succeeded',
      purchaseDate: payment.purchaseDate,
      registrationKey: payment.registrationKey || null,
      hasRegistrationKey: !!payment.registrationKey,
      registrationKeySent: payment.registrationKeySent,
      registrationKeySentAt: payment.registrationKeySentAt,
      paymentType: payment.paymentType,
      stripePaymentIntentId: payment.stripePaymentIntentId,
      metadata: payment.metadata
    }));

    res.status(200).json({
      success: true,
      data: {
        payments: formattedPayments,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / parseInt(limit)),
          totalPayments: total,
          perPage: parseInt(limit),
          hasNext: skip + payments.length < total,
          hasPrev: parseInt(page) > 1
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get payment statistics for dashboard
 */
exports.getPaymentStats = async (req, res, next) => {
  try {
    // Total successful payments
    const totalSuccessful = await Payment.countDocuments({ status: 'succeeded' });

    // Total failed payments
    const totalFailed = await Payment.countDocuments({ status: 'failed' });

    // Total revenue
    const revenueData = await Payment.aggregate([
      { $match: { status: 'succeeded' } },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: '$amount' },
          count: { $sum: 1 }
        }
      }
    ]);

    // Revenue by plan
    const revenueByPlan = await Payment.aggregate([
      { $match: { status: 'succeeded' } },
      {
        $group: {
          _id: '$subscriptionPlan',
          revenue: { $sum: '$amount' },
          count: { $sum: 1 }
        }
      }
    ]);

    // Lifetime purchases with registration keys
    const lifetimePurchases = await Payment.countDocuments({
      subscriptionPlan: 'lifetime',
      status: 'succeeded'
    });

    const lifetimeKeysGenerated = await Payment.countDocuments({
      subscriptionPlan: 'lifetime',
      status: 'succeeded',
      registrationKey: { $ne: null }
    });

    const lifetimeKeysSent = await Payment.countDocuments({
      subscriptionPlan: 'lifetime',
      status: 'succeeded',
      registrationKeySent: true
    });

    // Recent transactions (last 24 hours)
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentTransactions = await Payment.countDocuments({
      purchaseDate: { $gte: yesterday }
    });

    // Monthly recurring revenue (MRR)
    const monthlySubscribers = await Payment.countDocuments({
      subscriptionPlan: 'monthly',
      status: 'succeeded'
    });

    res.status(200).json({
      success: true,
      data: {
        totalSuccessful,
        totalFailed,
        totalRevenue: revenueData[0]?.totalRevenue || 0,
        totalTransactions: revenueData[0]?.count || 0,
        revenueByPlan: revenueByPlan.reduce((acc, item) => {
          acc[item._id || 'unknown'] = {
            revenue: item.revenue,
            count: item.count
          };
          return acc;
        }, {}),
        lifetime: {
          totalPurchases: lifetimePurchases,
          keysGenerated: lifetimeKeysGenerated,
          keysSent: lifetimeKeysSent,
          keysPending: lifetimeKeysGenerated - lifetimeKeysSent
        },
        recentTransactions,
        monthlySubscribers
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Mark registration key as sent
 */
exports.markKeySent = async (req, res, next) => {
  try {
    const { paymentId } = req.params;

    const payment = await Payment.findById(paymentId);

    if (!payment) {
      return res.status(404).json({
        success: false,
        error: 'Payment not found'
      });
    }

    if (!payment.registrationKey) {
      return res.status(400).json({
        success: false,
        error: 'This payment does not have a registration key'
      });
    }

    await payment.markKeySent();

    res.status(200).json({
      success: true,
      data: {
        message: 'Registration key marked as sent',
        payment: {
          _id: payment._id,
          userEmail: payment.userEmail,
          registrationKey: payment.registrationKey,
          registrationKeySent: payment.registrationKeySent,
          registrationKeySentAt: payment.registrationKeySentAt
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get user growth over time for charts
 */
exports.getUserGrowth = async (req, res, next) => {
  try {
    const { days = 30 } = req.query;
    const daysAgo = new Date(Date.now() - parseInt(days) * 24 * 60 * 60 * 1000);

    const userGrowth = await User.aggregate([
      {
        $match: {
          createdAt: { $gte: daysAgo }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$createdAt' }
          },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { _id: 1 }
      }
    ]);

    res.status(200).json({
      success: true,
      data: userGrowth
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get subscription distribution for pie chart
 */
exports.getSubscriptionDistribution = async (req, res, next) => {
  try {
    const distribution = await User.aggregate([
      {
        $group: {
          _id: '$subscriptionStatus',
          count: { $sum: 1 }
        }
      }
    ]);

    res.status(200).json({
      success: true,
      data: distribution
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get revenue analytics from user subscription data
 */
exports.getRevenueAnalytics = async (req, res, next) => {
  try {
    const { days = 30 } = req.query;
    const daysAgo = new Date(Date.now() - parseInt(days) * 24 * 60 * 60 * 1000);

    // Get users who started subscriptions in the date range
    const subscriptionTrend = await User.aggregate([
      {
        $match: {
          subscriptionStartDate: { $gte: daysAgo },
          subscriptionStatus: { $in: ['monthly', 'yearly', 'lifetime'] }
        }
      },
      {
        $group: {
          _id: {
            date: { $dateToString: { format: '%Y-%m-%d', date: '$subscriptionStartDate' }},
            plan: '$subscriptionPlan'
          },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { '_id.date': 1 }
      }
    ]);

    res.status(200).json({
      success: true,
      data: subscriptionTrend
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get plan distribution (monthly, yearly, lifetime)
 */
exports.getPlanDistribution = async (req, res, next) => {
  try {
    const planDistribution = await User.aggregate([
      {
        $match: {
          subscriptionPlan: { $ne: null }
        }
      },
      {
        $group: {
          _id: '$subscriptionPlan',
          count: { $sum: 1 }
        }
      }
    ]);

    res.status(200).json({
      success: true,
      data: planDistribution
    });
  } catch (error) {
    next(error);
  }
};
