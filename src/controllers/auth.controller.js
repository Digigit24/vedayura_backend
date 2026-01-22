const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { prisma } = require('../config/database');
const { validationResult } = require('express-validator');

/**
 * Generate JWT Token
 */
const generateToken = (userId) => {
  return jwt.sign(
    { userId },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
};

/**
 * Set Token Cookie
 */
const setTokenCookie = (res, token) => {
  res.cookie('token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
  });
};

/**
 * User Registration
 *
 * Sample Request:
 * POST /api/auth/register
 * Content-Type: application/json
 * Body:
 * {
 *   "name": "John Doe",
 *   "email": "john@example.com",
 *   "password": "SecurePass123",
 *   "phone": "+91-9876543210"
 * }
 *
 * Sample Response:
 * {
 *   "success": true,
 *   "message": "User registered successfully",
 *   "user": {
 *     "id": "uuid",
 *     "name": "John Doe",
 *     "email": "john@example.com",
 *     "role": "USER"
 *   },
 *   "token": "jwt_token_here"
 * }
 */
const register = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const { name, email, password, phone } = req.body;

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email }
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'Email already registered'
      });
    }

    // Hash password with bcrypt
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create user
    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        phone,
        role: 'USER'
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        phone: true
      }
    });

    // Create cart and wishlist for user
    await prisma.cart.create({
      data: { userId: user.id }
    });

    await prisma.wishlist.create({
      data: { userId: user.id }
    });

    // Generate token
    const token = generateToken(user.id);

    // Set HttpOnly cookie
    setTokenCookie(res, token);

    return res.status(201).json({
      success: true,
      message: 'User registered successfully',
      user,
      token
    });

  } catch (error) {
    console.error('Register Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Registration failed',
      error: error.message
    });
  }
};

/**
 * User Login
 *
 * Sample Request:
 * POST /api/auth/login
 * Content-Type: application/json
 * Body:
 * {
 *   "email": "john@example.com",
 *   "password": "SecurePass123"
 * }
 *
 * Sample Response:
 * {
 *   "success": true,
 *   "message": "Login successful",
 *   "user": {
 *     "id": "uuid",
 *     "name": "John Doe",
 *     "email": "john@example.com",
 *     "role": "USER"
 *   },
 *   "token": "jwt_token_here"
 * }
 */
const login = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const { email, password } = req.body;

    // Find user
    const user = await prisma.user.findUnique({
      where: { email }
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Verify password with bcrypt
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Generate token
    const token = generateToken(user.id);

    // Set HttpOnly cookie
    setTokenCookie(res, token);

    // Remove password from response
    const { password: _, ...userWithoutPassword } = user;

    return res.status(200).json({
      success: true,
      message: 'Login successful',
      user: userWithoutPassword,
      token
    });

  } catch (error) {
    console.error('Login Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Login failed',
      error: error.message
    });
  }
};

/**
 * User Logout
 *
 * Sample Request:
 * POST /api/auth/logout
 * Authorization: Bearer <token> OR Cookie: token=<token>
 *
 * Sample Response:
 * {
 *   "success": true,
 *   "message": "Logout successful"
 * }
 */
const logout = async (req, res) => {
  try {
    // Clear token cookie
    res.clearCookie('token');

    return res.status(200).json({
      success: true,
      message: 'Logout successful'
    });

  } catch (error) {
    console.error('Logout Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Logout failed',
      error: error.message
    });
  }
};

/**
 * Get Current User Profile
 *
 * Sample Request:
 * GET /api/auth/me
 * Authorization: Bearer <token> OR Cookie: token=<token>
 *
 * Sample Response:
 * {
 *   "success": true,
 *   "user": {
 *     "id": "uuid",
 *     "name": "John Doe",
 *     "email": "john@example.com",
 *     "role": "USER",
 *     "phone": "+91-9876543210"
 *   }
 * }
 */
const getMe = async (req, res) => {
  try {
    return res.status(200).json({
      success: true,
      user: req.user
    });
  } catch (error) {
    console.error('Get Me Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch user profile',
      error: error.message
    });
  }
};

module.exports = {
  register,
  login,
  logout,
  getMe
};
