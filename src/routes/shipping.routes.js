const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth.middleware');
const {
  calculateShippingCost,
  calculateShippingForCart,
  checkPincodeServiceability
} = require('../controllers/shipping.controller');

// Public pincode check
router.get('/check-pincode/:pincode', checkPincodeServiceability);

// Protected routes (require authentication)
router.post('/calculate', authenticate, calculateShippingCost);
router.post('/calculate-for-cart', authenticate, calculateShippingForCart);

module.exports = router;
