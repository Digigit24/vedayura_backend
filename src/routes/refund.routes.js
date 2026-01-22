const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const { authenticate, authorizeAdmin } = require('../middleware/auth.middleware');
const {
  requestRefund,
  getMyRefundRequests,
  getAllRefundRequests,
  approveRefund,
  rejectRefund,
  checkRefundStatus
} = require('../controllers/refund.controller');

// ============================================
// USER ROUTES (Protected)
// ============================================

const refundRequestValidation = [
  body('orderId').notEmpty().withMessage('Order ID is required'),
  body('reason').trim().notEmpty().withMessage('Reason is required'),
  body('userNote').optional().trim()
];

router.post('/request', authenticate, refundRequestValidation, requestRefund);
router.get('/my-requests', authenticate, getMyRefundRequests);

// ============================================
// ADMIN ROUTES (Admin Only)
// ============================================

router.get('/admin/all', authenticate, authorizeAdmin, getAllRefundRequests);
router.post('/admin/:id/approve', authenticate, authorizeAdmin, approveRefund);
router.post('/admin/:id/reject', authenticate, authorizeAdmin, rejectRefund);
router.get('/admin/:id/check-status', authenticate, authorizeAdmin, checkRefundStatus);

module.exports = router;
