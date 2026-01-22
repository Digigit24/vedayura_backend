const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth.middleware');
const {
  getWishlist,
  addToWishlist,
  removeFromWishlist
} = require('../controllers/wishlist.controller');

// All wishlist routes require authentication
router.use(authenticate);

router.get('/', getWishlist);
router.post('/add', addToWishlist);
router.delete('/remove/:itemId', removeFromWishlist);

module.exports = router;
