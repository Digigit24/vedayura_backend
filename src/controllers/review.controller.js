const { prisma } = require('../config/database');
const { validationResult } = require('express-validator');

/**
 * Get Product Reviews (PUBLIC ACCESS)
 *
 * Sample Request:
 * GET /api/reviews/product/:productId
 *
 * Sample Response:
 * {
 *   "success": true,
 *   "reviews": [
 *     {
 *       "id": "uuid",
 *       "rating": 5,
 *       "comment": "Excellent product!",
 *       "user": {
 *         "name": "John Doe"
 *       },
 *       "createdAt": "2024-01-01"
 *     }
 *   ],
 *   "averageRating": 4.5,
 *   "totalReviews": 10
 * }
 */
const getProductReviews = async (req, res) => {
  try {
    const { productId } = req.params;

    const reviews = await prisma.review.findMany({
      where: { productId },
      include: {
        user: {
          select: {
            id: true,
            name: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    const totalReviews = reviews.length;
    const averageRating = totalReviews > 0
      ? reviews.reduce((sum, review) => sum + review.rating, 0) / totalReviews
      : 0;

    return res.status(200).json({
      success: true,
      reviews,
      averageRating: parseFloat(averageRating.toFixed(1)),
      totalReviews
    });

  } catch (error) {
    console.error('Get Reviews Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch reviews',
      error: error.message
    });
  }
};

/**
 * Create Review
 *
 * Rating Validation: 1-5
 *
 * Sample Request:
 * POST /api/reviews
 * Authorization: Bearer <token>
 * Body:
 * {
 *   "productId": "uuid",
 *   "rating": 5,
 *   "comment": "Excellent product!"
 * }
 *
 * Sample Response:
 * {
 *   "success": true,
 *   "message": "Review added successfully",
 *   "review": {...}
 * }
 */
const createReview = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const userId = req.user.id;
    const { productId, rating, comment } = req.body;

    // Validate rating (1-5)
    if (rating < 1 || rating > 5) {
      return res.status(400).json({
        success: false,
        message: 'Rating must be between 1 and 5'
      });
    }

    // Check if product exists
    const product = await prisma.product.findUnique({
      where: { id: productId }
    });

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    // Check if user already reviewed this product
    const existingReview = await prisma.review.findUnique({
      where: {
        userId_productId: {
          userId,
          productId
        }
      }
    });

    if (existingReview) {
      return res.status(400).json({
        success: false,
        message: 'You have already reviewed this product'
      });
    }

    // Optional: Verify user has purchased this product
    const hasPurchased = await prisma.orderItem.findFirst({
      where: {
        productId,
        order: {
          userId,
          status: {
            in: ['PAID', 'SHIPPED', 'DELIVERED']
          }
        }
      }
    });

    if (!hasPurchased) {
      return res.status(403).json({
        success: false,
        message: 'You can only review products you have purchased'
      });
    }

    const review = await prisma.review.create({
      data: {
        userId,
        productId,
        rating: parseInt(rating),
        comment
      },
      include: {
        user: {
          select: {
            id: true,
            name: true
          }
        }
      }
    });

    return res.status(201).json({
      success: true,
      message: 'Review added successfully',
      review
    });

  } catch (error) {
    console.error('Create Review Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create review',
      error: error.message
    });
  }
};

/**
 * Update Review
 *
 * Sample Request:
 * PUT /api/reviews/:id
 * Authorization: Bearer <token>
 * Body: { "rating": 4, "comment": "Updated comment" }
 *
 * Sample Response:
 * {
 *   "success": true,
 *   "message": "Review updated successfully",
 *   "review": {...}
 * }
 */
const updateReview = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { rating, comment } = req.body;

    // Validate rating if provided
    if (rating && (rating < 1 || rating > 5)) {
      return res.status(400).json({
        success: false,
        message: 'Rating must be between 1 and 5'
      });
    }

    const review = await prisma.review.findUnique({
      where: { id }
    });

    if (!review) {
      return res.status(404).json({
        success: false,
        message: 'Review not found'
      });
    }

    if (review.userId !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized to update this review'
      });
    }

    const updateData = {};
    if (rating !== undefined) updateData.rating = parseInt(rating);
    if (comment !== undefined) updateData.comment = comment;

    const updatedReview = await prisma.review.update({
      where: { id },
      data: updateData,
      include: {
        user: {
          select: {
            id: true,
            name: true
          }
        }
      }
    });

    return res.status(200).json({
      success: true,
      message: 'Review updated successfully',
      review: updatedReview
    });

  } catch (error) {
    console.error('Update Review Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update review',
      error: error.message
    });
  }
};

/**
 * Delete Review
 *
 * Sample Request:
 * DELETE /api/reviews/:id
 * Authorization: Bearer <token>
 *
 * Sample Response:
 * {
 *   "success": true,
 *   "message": "Review deleted successfully"
 * }
 */
const deleteReview = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const review = await prisma.review.findUnique({
      where: { id }
    });

    if (!review) {
      return res.status(404).json({
        success: false,
        message: 'Review not found'
      });
    }

    if (review.userId !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized to delete this review'
      });
    }

    await prisma.review.delete({
      where: { id }
    });

    return res.status(200).json({
      success: true,
      message: 'Review deleted successfully'
    });

  } catch (error) {
    console.error('Delete Review Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete review',
      error: error.message
    });
  }
};

module.exports = {
  getProductReviews,
  createReview,
  updateReview,
  deleteReview
};
