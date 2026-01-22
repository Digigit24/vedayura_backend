const { prisma } = require('../config/database');

/**
 * Get User Cart
 *
 * Sample Request:
 * GET /api/cart
 * Authorization: Bearer <token> OR Cookie: token=<token>
 *
 * Sample Response:
 * {
 *   "success": true,
 *   "cart": {
 *     "id": "uuid",
 *     "items": [
 *       {
 *         "id": "uuid",
 *         "quantity": 2,
 *         "product": {
 *           "id": "uuid",
 *           "name": "Ashwagandha",
 *           "discountedPrice": 450,
 *           "imageUrls": ["..."]
 *         }
 *       }
 *     ],
 *     "totalItems": 2,
 *     "totalAmount": 900
 *   }
 * }
 */
const getCart = async (req, res) => {
  try {
    const userId = req.user.id;

    let cart = await prisma.cart.findUnique({
      where: { userId },
      include: {
        cartItems: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                discountedPrice: true,
                stockQuantity: true,
                imageUrls: true,
                isActive: true
              }
            }
          }
        }
      }
    });

    // Create cart if doesn't exist
    if (!cart) {
      cart = await prisma.cart.create({
        data: { userId },
        include: {
          cartItems: {
            include: {
              product: true
            }
          }
        }
      });
    }

    // Calculate totals
    const totalItems = cart.cartItems.reduce((sum, item) => sum + item.quantity, 0);
    const totalAmount = cart.cartItems.reduce(
      (sum, item) => sum + (parseFloat(item.product.discountedPrice) * item.quantity),
      0
    );

    return res.status(200).json({
      success: true,
      cart: {
        id: cart.id,
        items: cart.cartItems,
        totalItems,
        totalAmount: parseFloat(totalAmount.toFixed(2))
      }
    });

  } catch (error) {
    console.error('Get Cart Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch cart',
      error: error.message
    });
  }
};

/**
 * Add Item to Cart
 *
 * Inventory Management:
 * - Prevents adding to cart if quantity > stock_quantity
 *
 * Sample Request:
 * POST /api/cart/add
 * Authorization: Bearer <token>
 * Body:
 * {
 *   "productId": "uuid",
 *   "quantity": 2
 * }
 *
 * Sample Response:
 * {
 *   "success": true,
 *   "message": "Product added to cart",
 *   "cartItem": {...}
 * }
 */
const addToCart = async (req, res) => {
  try {
    const userId = req.user.id;
    const { productId, quantity = 1 } = req.body;

    if (!productId) {
      return res.status(400).json({
        success: false,
        message: 'Product ID is required'
      });
    }

    if (quantity <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Quantity must be greater than 0'
      });
    }

    // Check product exists and stock availability
    const product = await prisma.product.findUnique({
      where: { id: productId }
    });

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    if (!product.isActive) {
      return res.status(400).json({
        success: false,
        message: 'Product is not available'
      });
    }

    // INVENTORY CHECK: Prevent adding if quantity > stock_quantity
    if (quantity > product.stockQuantity) {
      return res.status(400).json({
        success: false,
        message: `Only ${product.stockQuantity} items available in stock`
      });
    }

    // Get or create cart
    let cart = await prisma.cart.findUnique({
      where: { userId }
    });

    if (!cart) {
      cart = await prisma.cart.create({
        data: { userId }
      });
    }

    // Check if item already exists in cart
    const existingItem = await prisma.cartItem.findUnique({
      where: {
        cartId_productId: {
          cartId: cart.id,
          productId
        }
      }
    });

    let cartItem;

    if (existingItem) {
      const newQuantity = existingItem.quantity + quantity;

      // Check stock for updated quantity
      if (newQuantity > product.stockQuantity) {
        return res.status(400).json({
          success: false,
          message: `Cannot add. Only ${product.stockQuantity} items available in stock`
        });
      }

      cartItem = await prisma.cartItem.update({
        where: {
          cartId_productId: {
            cartId: cart.id,
            productId
          }
        },
        data: {
          quantity: newQuantity
        },
        include: {
          product: true
        }
      });
    } else {
      cartItem = await prisma.cartItem.create({
        data: {
          cartId: cart.id,
          productId,
          quantity
        },
        include: {
          product: true
        }
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Product added to cart',
      cartItem
    });

  } catch (error) {
    console.error('Add to Cart Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to add product to cart',
      error: error.message
    });
  }
};

/**
 * Update Cart Item Quantity
 *
 * Sample Request:
 * PUT /api/cart/update/:itemId
 * Authorization: Bearer <token>
 * Body: { "quantity": 3 }
 *
 * Sample Response:
 * {
 *   "success": true,
 *   "message": "Cart updated",
 *   "cartItem": {...}
 * }
 */
const updateCartItem = async (req, res) => {
  try {
    const userId = req.user.id;
    const { itemId } = req.params;
    const { quantity } = req.body;

    if (!quantity || quantity <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Quantity must be greater than 0'
      });
    }

    // Get cart item with product info
    const cartItem = await prisma.cartItem.findUnique({
      where: { id: itemId },
      include: {
        cart: true,
        product: true
      }
    });

    if (!cartItem) {
      return res.status(404).json({
        success: false,
        message: 'Cart item not found'
      });
    }

    // Verify cart belongs to user
    if (cartItem.cart.userId !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized access'
      });
    }

    // Check stock availability
    if (quantity > cartItem.product.stockQuantity) {
      return res.status(400).json({
        success: false,
        message: `Only ${cartItem.product.stockQuantity} items available in stock`
      });
    }

    const updatedItem = await prisma.cartItem.update({
      where: { id: itemId },
      data: { quantity },
      include: {
        product: true
      }
    });

    return res.status(200).json({
      success: true,
      message: 'Cart updated',
      cartItem: updatedItem
    });

  } catch (error) {
    console.error('Update Cart Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update cart',
      error: error.message
    });
  }
};

/**
 * Remove Item from Cart
 *
 * Sample Request:
 * DELETE /api/cart/remove/:itemId
 * Authorization: Bearer <token>
 *
 * Sample Response:
 * {
 *   "success": true,
 *   "message": "Item removed from cart"
 * }
 */
const removeFromCart = async (req, res) => {
  try {
    const userId = req.user.id;
    const { itemId } = req.params;

    const cartItem = await prisma.cartItem.findUnique({
      where: { id: itemId },
      include: {
        cart: true
      }
    });

    if (!cartItem) {
      return res.status(404).json({
        success: false,
        message: 'Cart item not found'
      });
    }

    // Verify cart belongs to user
    if (cartItem.cart.userId !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized access'
      });
    }

    await prisma.cartItem.delete({
      where: { id: itemId }
    });

    return res.status(200).json({
      success: true,
      message: 'Item removed from cart'
    });

  } catch (error) {
    console.error('Remove from Cart Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to remove item from cart',
      error: error.message
    });
  }
};

/**
 * Clear Cart
 *
 * Sample Request:
 * DELETE /api/cart/clear
 * Authorization: Bearer <token>
 *
 * Sample Response:
 * {
 *   "success": true,
 *   "message": "Cart cleared"
 * }
 */
const clearCart = async (req, res) => {
  try {
    const userId = req.user.id;

    const cart = await prisma.cart.findUnique({
      where: { userId }
    });

    if (!cart) {
      return res.status(404).json({
        success: false,
        message: 'Cart not found'
      });
    }

    await prisma.cartItem.deleteMany({
      where: { cartId: cart.id }
    });

    return res.status(200).json({
      success: true,
      message: 'Cart cleared'
    });

  } catch (error) {
    console.error('Clear Cart Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to clear cart',
      error: error.message
    });
  }
};

module.exports = {
  getCart,
  addToCart,
  updateCartItem,
  removeFromCart,
  clearCart
};
