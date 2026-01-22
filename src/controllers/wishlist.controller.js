const { prisma } = require('../config/database');

/**
 * Get User Wishlist
 *
 * Sample Request:
 * GET /api/wishlist
 * Authorization: Bearer <token> OR Cookie: token=<token>
 *
 * Sample Response:
 * {
 *   "success": true,
 *   "wishlist": {
 *     "id": "uuid",
 *     "items": [
 *       {
 *         "id": "uuid",
 *         "product": {
 *           "id": "uuid",
 *           "name": "Ashwagandha",
 *           "discountedPrice": 450,
 *           "imageUrls": ["..."]
 *         }
 *       }
 *     ],
 *     "totalItems": 5
 *   }
 * }
 */
const getWishlist = async (req, res) => {
  try {
    const userId = req.user.id;

    let wishlist = await prisma.wishlist.findUnique({
      where: { userId },
      include: {
        wishlistItems: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                discountedPrice: true,
                realPrice: true,
                stockQuantity: true,
                imageUrls: true,
                isActive: true
              }
            }
          }
        }
      }
    });

    // Create wishlist if doesn't exist
    if (!wishlist) {
      wishlist = await prisma.wishlist.create({
        data: { userId },
        include: {
          wishlistItems: {
            include: {
              product: true
            }
          }
        }
      });
    }

    return res.status(200).json({
      success: true,
      wishlist: {
        id: wishlist.id,
        items: wishlist.wishlistItems,
        totalItems: wishlist.wishlistItems.length
      }
    });

  } catch (error) {
    console.error('Get Wishlist Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch wishlist',
      error: error.message
    });
  }
};

/**
 * Add Item to Wishlist
 *
 * Sample Request:
 * POST /api/wishlist/add
 * Authorization: Bearer <token>
 * Body: { "productId": "uuid" }
 *
 * Sample Response:
 * {
 *   "success": true,
 *   "message": "Product added to wishlist",
 *   "wishlistItem": {...}
 * }
 */
const addToWishlist = async (req, res) => {
  try {
    const userId = req.user.id;
    const { productId } = req.body;

    if (!productId) {
      return res.status(400).json({
        success: false,
        message: 'Product ID is required'
      });
    }

    // Check product exists
    const product = await prisma.product.findUnique({
      where: { id: productId }
    });

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    // Get or create wishlist
    let wishlist = await prisma.wishlist.findUnique({
      where: { userId }
    });

    if (!wishlist) {
      wishlist = await prisma.wishlist.create({
        data: { userId }
      });
    }

    // Check if already in wishlist
    const existingItem = await prisma.wishlistItem.findUnique({
      where: {
        wishlistId_productId: {
          wishlistId: wishlist.id,
          productId
        }
      }
    });

    if (existingItem) {
      return res.status(400).json({
        success: false,
        message: 'Product already in wishlist'
      });
    }

    const wishlistItem = await prisma.wishlistItem.create({
      data: {
        wishlistId: wishlist.id,
        productId
      },
      include: {
        product: true
      }
    });

    return res.status(200).json({
      success: true,
      message: 'Product added to wishlist',
      wishlistItem
    });

  } catch (error) {
    console.error('Add to Wishlist Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to add product to wishlist',
      error: error.message
    });
  }
};

/**
 * Remove Item from Wishlist
 *
 * Sample Request:
 * DELETE /api/wishlist/remove/:itemId
 * Authorization: Bearer <token>
 *
 * Sample Response:
 * {
 *   "success": true,
 *   "message": "Item removed from wishlist"
 * }
 */
const removeFromWishlist = async (req, res) => {
  try {
    const userId = req.user.id;
    const { itemId } = req.params;

    const wishlistItem = await prisma.wishlistItem.findUnique({
      where: { id: itemId },
      include: {
        wishlist: true
      }
    });

    if (!wishlistItem) {
      return res.status(404).json({
        success: false,
        message: 'Wishlist item not found'
      });
    }

    // Verify wishlist belongs to user
    if (wishlistItem.wishlist.userId !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized access'
      });
    }

    await prisma.wishlistItem.delete({
      where: { id: itemId }
    });

    return res.status(200).json({
      success: true,
      message: 'Item removed from wishlist'
    });

  } catch (error) {
    console.error('Remove from Wishlist Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to remove item from wishlist',
      error: error.message
    });
  }
};

module.exports = {
  getWishlist,
  addToWishlist,
  removeFromWishlist
};
