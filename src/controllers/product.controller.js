const { prisma } = require('../config/database');
const { validationResult } = require('express-validator');

/**
 * Get All Products (PUBLIC ACCESS)
 *
 * Sample Request:
 * GET /api/products?page=1&limit=10&category=uuid&search=ashwagandha
 *
 * Sample Response:
 * {
 *   "success": true,
 *   "products": [
 *     {
 *       "id": "uuid",
 *       "name": "Ashwagandha Powder",
 *       "description": "Premium quality ashwagandha",
 *       "realPrice": 500,
 *       "discountedPrice": 450,
 *       "stockQuantity": 100,
 *       "imageUrls": ["https://s3.aws.com/img1.jpg"],
 *       "category": { "id": "uuid", "name": "Herbs" }
 *     }
 *   ],
 *   "pagination": {
 *     "total": 50,
 *     "page": 1,
 *     "limit": 10,
 *     "totalPages": 5
 *   }
 * }
 */
const getAllProducts = async (req, res) => {
  try {
    const { page = 1, limit = 10, category, search } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const where = {
      isActive: true,
      ...(category && { categoryId: category }),
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } }
        ]
      })
    };

    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where,
        skip,
        take: parseInt(limit),
        include: {
          category: {
            select: { id: true, name: true }
          }
        },
        orderBy: { createdAt: 'desc' }
      }),
      prisma.product.count({ where })
    ]);

    return res.status(200).json({
      success: true,
      products,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });

  } catch (error) {
    console.error('Get Products Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch products',
      error: error.message
    });
  }
};

/**
 * Get Single Product (PUBLIC ACCESS)
 *
 * Sample Request:
 * GET /api/products/:id
 *
 * Sample Response:
 * {
 *   "success": true,
 *   "product": {
 *     "id": "uuid",
 *     "name": "Ashwagandha Powder",
 *     "description": "Premium quality",
 *     "realPrice": 500,
 *     "discountedPrice": 450,
 *     "stockQuantity": 100,
 *     "imageUrls": ["https://s3.aws.com/img1.jpg"],
 *     "category": { "name": "Herbs" },
 *     "reviews": [...]
 *   }
 * }
 */
const getProductById = async (req, res) => {
  try {
    const { id } = req.params;

    const product = await prisma.product.findUnique({
      where: { id },
      include: {
        category: {
          select: { id: true, name: true, imageUrl: true }
        },
        reviews: {
          include: {
            user: {
              select: { id: true, name: true }
            }
          },
          orderBy: { createdAt: 'desc' }
        }
      }
    });

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    // Calculate average rating
    const avgRating = product.reviews.length > 0
      ? product.reviews.reduce((acc, review) => acc + review.rating, 0) / product.reviews.length
      : 0;

    return res.status(200).json({
      success: true,
      product: {
        ...product,
        averageRating: parseFloat(avgRating.toFixed(1))
      }
    });

  } catch (error) {
    console.error('Get Product Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch product',
      error: error.message
    });
  }
};

/**
 * Create Product (ADMIN ONLY)
 *
 * Sample Request:
 * POST /api/admin/products
 * Authorization: Bearer <admin_token>
 * Content-Type: application/json
 * Body:
 * {
 *   "name": "Ashwagandha Powder",
 *   "description": "Premium quality ashwagandha powder",
 *   "categoryId": "uuid",
 *   "realPrice": 500,
 *   "discountedPrice": 450,
 *   "stockQuantity": 100,
 *   "imageUrls": ["https://s3.aws.com/bucket/img1.jpg"]
 * }
 *
 * Sample Response:
 * {
 *   "success": true,
 *   "message": "Product created successfully",
 *   "product": {
 *     "id": "uuid",
 *     "name": "Ashwagandha Powder",
 *     ...
 *   }
 * }
 */
const createProduct = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const {
      name,
      description,
      categoryId,
      realPrice,
      discountedPrice,
      stockQuantity,
      imageUrls
    } = req.body;

    // Verify category exists
    const category = await prisma.category.findUnique({
      where: { id: categoryId }
    });

    if (!category) {
      return res.status(404).json({
        success: false,
        message: 'Category not found'
      });
    }

    const product = await prisma.product.create({
      data: {
        name,
        description,
        categoryId,
        realPrice: parseFloat(realPrice),
        discountedPrice: parseFloat(discountedPrice),
        stockQuantity: parseInt(stockQuantity),
        imageUrls: imageUrls || []
      },
      include: {
        category: true
      }
    });

    return res.status(201).json({
      success: true,
      message: 'Product created successfully',
      product
    });

  } catch (error) {
    console.error('Create Product Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create product',
      error: error.message
    });
  }
};

/**
 * Update Product (ADMIN ONLY)
 *
 * Sample Request:
 * PUT /api/admin/products/:id
 * Authorization: Bearer <admin_token>
 * Body: { "stockQuantity": 150, "discountedPrice": 400 }
 *
 * Sample Response:
 * {
 *   "success": true,
 *   "message": "Product updated successfully",
 *   "product": {...}
 * }
 */
const updateProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    // Convert numeric fields
    if (updateData.realPrice) updateData.realPrice = parseFloat(updateData.realPrice);
    if (updateData.discountedPrice) updateData.discountedPrice = parseFloat(updateData.discountedPrice);
    if (updateData.stockQuantity) updateData.stockQuantity = parseInt(updateData.stockQuantity);

    const product = await prisma.product.update({
      where: { id },
      data: updateData,
      include: {
        category: true
      }
    });

    return res.status(200).json({
      success: true,
      message: 'Product updated successfully',
      product
    });

  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    console.error('Update Product Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update product',
      error: error.message
    });
  }
};

/**
 * Delete Product (ADMIN ONLY)
 *
 * Sample Request:
 * DELETE /api/admin/products/:id
 * Authorization: Bearer <admin_token>
 *
 * Sample Response:
 * {
 *   "success": true,
 *   "message": "Product deleted successfully"
 * }
 */
const deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;

    await prisma.product.delete({
      where: { id }
    });

    return res.status(200).json({
      success: true,
      message: 'Product deleted successfully'
    });

  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    console.error('Delete Product Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete product',
      error: error.message
    });
  }
};

module.exports = {
  getAllProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct
};
