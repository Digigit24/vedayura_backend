const jwt = require('jsonwebtoken');
const { prisma } = require('../config/database');

/**
 * Dual-Layer Authentication Middleware
 *
 * Strategy:
 * 1. First attempt to read 'token' from HttpOnly Cookie
 * 2. If undefined, check 'Authorization: Bearer <token>' header
 * 3. If both fail, return 401 Unauthorized
 *
 * Usage:
 * - Apply to protected routes that require authentication
 */
const authenticate = async (req, res, next) => {
  try {
    let token;

    // Step 1: Try to get token from HttpOnly Cookie
    if (req.cookies && req.cookies.token) {
      token = req.cookies.token;
    }
    // Step 2: If not in cookie, check Authorization Bearer header
    else if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      token = req.headers.authorization.substring(7);
    }

    // Step 3: If no token found in either location, return 401
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required. Please login.'
      });
    }

    // Verify JWT token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Fetch user from database
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        phone: true
      }
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User not found. Please login again.'
      });
    }

    // Attach user to request object
    req.user = user;
    next();

  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Invalid token. Please login again.'
      });
    }

    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token expired. Please login again.'
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Authentication failed',
      error: error.message
    });
  }
};

/**
 * Admin Authorization Middleware
 *
 * Must be used AFTER authenticate middleware
 * Checks if authenticated user has ADMIN role
 */
const authorizeAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required'
    });
  }

  if (req.user.role !== 'ADMIN') {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Admin privileges required.'
    });
  }

  next();
};

module.exports = { authenticate, authorizeAdmin };
