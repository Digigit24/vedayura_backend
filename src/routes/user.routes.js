const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const { authenticate } = require('../middleware/auth.middleware');
const {
  getAddresses,
  addAddress,
  updateAddress,
  deleteAddress
} = require('../controllers/user.controller');

// All user routes require authentication
router.use(authenticate);

// Address Management Routes
const addressValidation = [
  body('street').trim().notEmpty().withMessage('Street is required'),
  body('city').trim().notEmpty().withMessage('City is required'),
  body('state').trim().notEmpty().withMessage('State is required'),
  body('pincode').trim().notEmpty().withMessage('Pincode is required')
];

router.get('/addresses', getAddresses);
router.post('/address', addressValidation, addAddress);
router.put('/address/:id', updateAddress);
router.delete('/address/:id', deleteAddress);

module.exports = router;
