const { prisma } = require('../config/database');
const { validationResult } = require('express-validator');

/**
 * Get All Categories (PUBLIC ACCESS)
 *
 * Sample Request:
 * GET /api/categories
 *
 * Sample Response:
 * {
 *   "success": true,
 *   "categories": [
 *     {
 *       "id": "uuid",
 *       "name": "Ayurvedic Herbs",
 *       "imageUrl": "https://s3.aws.com/category1.jpg",
 *       "description": "Traditional herbs",
 *       "productCount": 25
 *     }
 *   ]
 * }
 */
const getAllCategories = async (req, res) => {
  try {
    const categories = await prisma.category.findMany({
      include: {
        _count: {
          select: { products: true }
        }
      },
      orderBy: { name: 'asc' }
    });

    const categoriesWithCount = categories.map(category => ({
      id: category.id,
      name: category.name,
      imageUrl: category.imageUrl,
      description: category.description,
      productCount: category._count.products
    }));

    return res.status(200).json({
      success: true,
      categories: categoriesWithCount
    });

  } catch (error) {
    console.error('Get Categories Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch categories',
      error: error.message
    });
  }
};

/**
 * Get Category by ID (PUBLIC ACCESS)
 *
 * Sample Request:
 * GET /api/categories/:id
 *
 * Sample Response:
 * {
 *   "success": true,
 *   "category": {
 *     "id": "uuid",
 *     "name": "Ayurvedic Herbs",
 *     "products": [...]
 *   }
 * }
 */
const getCategoryById = async (req, res) => {
  try {
    const { id } = req.params;

    const category = await prisma.category.findUnique({
      where: { id },
      include: {
        products: {
          where: { isActive: true }
        }
      }
    });

    if (!category) {
      return res.status(404).json({
        success: false,
        message: 'Category not found'
      });
    }

    return res.status(200).json({
      success: true,
      category
    });

  } catch (error) {
    console.error('Get Category Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch category',
      error: error.message
    });
  }
};

/**
 * Create Category (ADMIN ONLY)
 *
 * Sample Request:
 * POST /api/admin/categories
 * Authorization: Bearer <admin_token>
 * Body:
 * {
 *   "name": "Ayurvedic Herbs",
 *   "imageUrl": "https://s3.aws.com/category.jpg",
 *   "description": "Traditional herbs"
 * }
 *
 * Sample Response:
 * {
 *   "success": true,
 *   "message": "Category created successfully",
 *   "category": {...}
 * }
 */
const createCategory = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const { name, imageUrl, description } = req.body;

    const category = await prisma.category.create({
      data: {
        name,
        imageUrl,
        description
      }
    });

    return res.status(201).json({
      success: true,
      message: 'Category created successfully',
      category
    });

  } catch (error) {
    if (error.code === 'P2002') {
      return res.status(400).json({
        success: false,
        message: 'Category name already exists'
      });
    }

    console.error('Create Category Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create category',
      error: error.message
    });
  }
};

/**
 * Update Category (ADMIN ONLY)
 *
 * Sample Request:
 * PUT /api/admin/categories/:id
 * Authorization: Bearer <admin_token>
 * Body: { "name": "Updated Name" }
 *
 * Sample Response:
 * {
 *   "success": true,
 *   "message": "Category updated successfully",
 *   "category": {...}
 * }
 */
const updateCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const category = await prisma.category.update({
      where: { id },
      data: updateData
    });

    return res.status(200).json({
      success: true,
      message: 'Category updated successfully',
      category
    });

  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({
        success: false,
        message: 'Category not found'
      });
    }

    console.error('Update Category Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update category',
      error: error.message
    });
  }
};

/**
 * Delete Category (ADMIN ONLY)
 *
 * Sample Request:
 * DELETE /api/admin/categories/:id
 * Authorization: Bearer <admin_token>
 *
 * Sample Response:
 * {
 *   "success": true,
 *   "message": "Category deleted successfully"
 * }
 */
const deleteCategory = async (req, res) => {
  try {
    const { id } = req.params;

    await prisma.category.delete({
      where: { id }
    });

    return res.status(200).json({
      success: true,
      message: 'Category deleted successfully'
    });

  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({
        success: false,
        message: 'Category not found'
      });
    }

    console.error('Delete Category Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete category',
      error: error.message
    });
  }
};

module.exports = {
  getAllCategories,
  getCategoryById,
  createCategory,
  updateCategory,
  deleteCategory
};
