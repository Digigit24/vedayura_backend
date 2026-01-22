const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth.middleware');
const {
  createOrder,
  verifyPayment,
  getUserOrders,
  getOrderById,
  trackOrder,
  cancelOrder
} = require('../controllers/order.enhanced.controller');

// All order routes require authentication
router.use(authenticate);

router.post('/checkout', createOrder);
router.post('/verify-payment', verifyPayment);
router.get('/', getUserOrders);
router.get('/:id', getOrderById);
router.get('/:id/track', trackOrder);
router.put('/:id/cancel', cancelOrder);

module.exports = router;
