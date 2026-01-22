const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const { authenticate } = require('../middleware/auth.middleware');
const {
  getProductReviews,
  createReview,
  updateReview,
  deleteReview
} = require('../controllers/review.controller');

// Public Routes
router.get('/product/:productId', getProductReviews);

// Protected Routes
const reviewValidation = [
  body('productId').notEmpty().withMessage('Product ID is required'),
  body('rating')
    .isInt({ min: 1, max: 5 })
    .withMessage('Rating must be between 1 and 5'),
  body('comment').optional().trim()
];

router.post('/', authenticate, reviewValidation, createReview);
router.put('/:id', authenticate, updateReview);
router.delete('/:id', authenticate, deleteReview);

module.exports = router;
