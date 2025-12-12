/**
 * Admin Authentication Middleware
 *
 * This is a simple API key-based authentication.
 * For production, consider implementing:
 * - JWT tokens with admin role
 * - Session-based auth
 * - OAuth
 */

const adminAuth = (req, res, next) => {
  try {
    // Get API key from header
    const apiKey = req.headers['x-admin-api-key'] || req.headers['authorization']?.replace('Bearer ', '');

    // Check if API key exists
    if (!apiKey) {
      return res.status(401).json({
        success: false,
        error: 'Admin authentication required. Please provide x-admin-api-key header.'
      });
    }

    // Verify API key
    const adminApiKey = process.env.ADMIN_API_KEY || 'admin_secret_key_change_this';

    if (apiKey !== adminApiKey) {
      return res.status(403).json({
        success: false,
        error: 'Invalid admin API key'
      });
    }

    // API key is valid, continue
    next();
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'Admin authentication failed'
    });
  }
};

module.exports = adminAuth;
