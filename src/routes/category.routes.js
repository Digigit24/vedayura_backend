const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const { authenticate, authorizeAdmin } = require('../middleware/auth.middleware');
const {
  getAllCategories,
  getCategoryById,
  createCategory,
  updateCategory,
  deleteCategory
} = require('../controllers/category.controller');

// Public Routes (No Authentication Required)
router.get('/', getAllCategories);
router.get('/:id', getCategoryById);

// Admin Routes (Authentication + Admin Authorization Required)
const categoryValidation = [
  body('name').trim().notEmpty().withMessage('Category name is required')
];

router.post('/', authenticate, authorizeAdmin, categoryValidation, createCategory);
router.put('/:id', authenticate, authorizeAdmin, updateCategory);
router.delete('/:id', authenticate, authorizeAdmin, deleteCategory);

module.exports = router;
