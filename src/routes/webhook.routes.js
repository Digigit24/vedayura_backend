const express = require('express');
const router = express.Router();
const {
  handleShiprocketWebhook,
  handleRazorpayWebhook
} = require('../controllers/webhook.controller');

// Webhook endpoints (no authentication - verified via signature)
router.post('/shiprocket', handleShiprocketWebhook);
router.post('/razorpay', handleRazorpayWebhook);

module.exports = router;
