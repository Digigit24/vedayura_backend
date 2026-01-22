const express = require('express');
const router = express.Router();
const { getAllProducts, getProductById } = require('../controllers/product.controller');

// Public Routes (No Authentication Required)
router.get('/', getAllProducts);
router.get('/:id', getProductById);

module.exports = router;
