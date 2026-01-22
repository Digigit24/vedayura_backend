const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const { authenticate, authorizeAdmin } = require('../middleware/auth.middleware');
const upload = require('../utils/multer.config');
const { uploadImageToS3, uploadMultipleImages } = require('../controllers/upload.controller');
const {
  createProduct,
  updateProduct,
  deleteProduct
} = require('../controllers/product.controller');
const {
  createCategory,
  updateCategory,
  deleteCategory
} = require('../controllers/category.controller');
const { updateOrderStatus } = require('../controllers/order.controller');

// Apply authentication and admin authorization to all admin routes
router.use(authenticate);
router.use(authorizeAdmin);

// Upload Routes
router.post('/upload', upload.single('image'), uploadImageToS3);
router.post('/upload/multiple', upload.array('images', 10), uploadMultipleImages);

// Product Management Routes
const productValidation = [
  body('name').trim().notEmpty().withMessage('Product name is required'),
  body('categoryId').notEmpty().withMessage('Category ID is required'),
  body('realPrice').isFloat({ min: 0 }).withMessage('Real price must be a positive number'),
  body('discountedPrice').isFloat({ min: 0 }).withMessage('Discounted price must be a positive number'),
  body('stockQuantity').isInt({ min: 0 }).withMessage('Stock quantity must be a non-negative integer')
];

router.post('/products', productValidation, createProduct);
router.put('/products/:id', updateProduct);
router.delete('/products/:id', deleteProduct);

// Category Management Routes
const categoryValidation = [
  body('name').trim().notEmpty().withMessage('Category name is required')
];

router.post('/categories', categoryValidation, createCategory);
router.put('/categories/:id', updateCategory);
router.delete('/categories/:id', deleteCategory);

// Order Management Routes
router.put('/orders/:id/status', updateOrderStatus);

module.exports = router;
