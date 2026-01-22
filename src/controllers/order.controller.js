const { prisma } = require('../config/database');
const { razorpayInstance } = require('../config/razorpay');
const crypto = require('crypto');

/**
 * Create Order / Checkout
 *
 * Business Logic:
 * - Backend calculates total from Cart
 * - Initiates Razorpay Order
 * - Returns razorpay_order_id to frontend
 * - Decrements stock_quantity when order is placed
 *
 * Sample Request:
 * POST /api/orders/checkout
 * Authorization: Bearer <token>
 * Body:
 * {
 *   "addressId": "uuid"
 * }
 *
 * Sample Response:
 * {
 *   "success": true,
 *   "message": "Order created successfully",
 *   "order": {
 *     "id": "uuid",
 *     "razorpayOrderId": "order_xyz123",
 *     "amount": 1500,
 *     "currency": "INR"
 *   },
 *   "razorpayKeyId": "rzp_test_xxxxx"
 * }
 */
const createOrder = async (req, res) => {
  try {
    const userId = req.user.id;
    const { addressId } = req.body;

    if (!addressId) {
      return res.status(400).json({
        success: false,
        message: 'Address ID is required'
      });
    }

    // Get address and verify it belongs to user
    const address = await prisma.address.findUnique({
      where: { id: addressId }
    });

    if (!address || address.userId !== userId) {
      return res.status(404).json({
        success: false,
        message: 'Address not found'
      });
    }

    // Get cart with items
    const cart = await prisma.cart.findUnique({
      where: { userId },
      include: {
        cartItems: {
          include: {
            product: true
          }
        }
      }
    });

    if (!cart || cart.cartItems.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Cart is empty'
      });
    }

    // Calculate total amount and verify stock
    let totalAmount = 0;
    const orderItems = [];

    for (const item of cart.cartItems) {
      const product = item.product;

      // Check if product is active
      if (!product.isActive) {
        return res.status(400).json({
          success: false,
          message: `Product "${product.name}" is no longer available`
        });
      }

      // Check stock availability
      if (item.quantity > product.stockQuantity) {
        return res.status(400).json({
          success: false,
          message: `Insufficient stock for "${product.name}". Only ${product.stockQuantity} available`
        });
      }

      totalAmount += parseFloat(product.discountedPrice) * item.quantity;

      orderItems.push({
        productId: product.id,
        quantity: item.quantity,
        priceAtPurchase: product.discountedPrice
      });
    }

    // Create Razorpay Order
    const razorpayOrder = await razorpayInstance.orders.create({
      amount: Math.round(totalAmount * 100), // Amount in paise
      currency: 'INR',
      receipt: `receipt_${Date.now()}`
    });

    // Create address snapshot (not a reference)
    const addressSnapshot = {
      street: address.street,
      city: address.city,
      state: address.state,
      pincode: address.pincode,
      country: address.country
    };

    // Create order in database
    const order = await prisma.order.create({
      data: {
        userId,
        totalAmount,
        status: 'PENDING',
        shippingAddressSnapshot: addressSnapshot,
        orderItems: {
          create: orderItems
        },
        payment: {
          create: {
            razorpayOrderId: razorpayOrder.id,
            amount: totalAmount,
            status: 'PENDING'
          }
        }
      },
      include: {
        orderItems: {
          include: {
            product: true
          }
        },
        payment: true
      }
    });

    // Decrement stock quantity for each product (Inventory Management)
    for (const item of cart.cartItems) {
      await prisma.product.update({
        where: { id: item.productId },
        data: {
          stockQuantity: {
            decrement: item.quantity
          }
        }
      });
    }

    // Clear cart after order creation
    await prisma.cartItem.deleteMany({
      where: { cartId: cart.id }
    });

    return res.status(201).json({
      success: true,
      message: 'Order created successfully',
      order: {
        id: order.id,
        razorpayOrderId: razorpayOrder.id,
        amount: totalAmount,
        currency: 'INR'
      },
      razorpayKeyId: process.env.RAZORPAY_KEY_ID
    });

  } catch (error) {
    console.error('Create Order Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create order',
      error: error.message
    });
  }
};

/**
 * Verify Payment
 *
 * Verifies Razorpay signature and updates order status
 *
 * Sample Request:
 * POST /api/orders/verify-payment
 * Authorization: Bearer <token>
 * Body:
 * {
 *   "orderId": "uuid",
 *   "razorpayPaymentId": "pay_xyz123",
 *   "razorpayOrderId": "order_xyz123",
 *   "razorpaySignature": "signature_string"
 * }
 *
 * Sample Response:
 * {
 *   "success": true,
 *   "message": "Payment verified successfully",
 *   "order": {...}
 * }
 */
const verifyPayment = async (req, res) => {
  try {
    const userId = req.user.id;
    const { orderId, razorpayPaymentId, razorpayOrderId, razorpaySignature } = req.body;

    if (!orderId || !razorpayPaymentId || !razorpayOrderId || !razorpaySignature) {
      return res.status(400).json({
        success: false,
        message: 'Missing payment verification details'
      });
    }

    // Get order and verify it belongs to user
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        payment: true
      }
    });

    if (!order || order.userId !== userId) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Verify Razorpay signature
    const generatedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpayOrderId}|${razorpayPaymentId}`)
      .digest('hex');

    if (generatedSignature !== razorpaySignature) {
      // Payment verification failed
      await prisma.payment.update({
        where: { id: order.payment.id },
        data: {
          status: 'FAILED'
        }
      });

      return res.status(400).json({
        success: false,
        message: 'Payment verification failed'
      });
    }

    // Update payment and order status
    await prisma.payment.update({
      where: { id: order.payment.id },
      data: {
        razorpayPaymentId,
        razorpaySignature,
        status: 'SUCCESS'
      }
    });

    const updatedOrder = await prisma.order.update({
      where: { id: orderId },
      data: {
        status: 'PAID'
      },
      include: {
        orderItems: {
          include: {
            product: true
          }
        },
        payment: true
      }
    });

    return res.status(200).json({
      success: true,
      message: 'Payment verified successfully',
      order: updatedOrder
    });

  } catch (error) {
    console.error('Verify Payment Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to verify payment',
      error: error.message
    });
  }
};

/**
 * Get User Orders
 *
 * Sample Request:
 * GET /api/orders
 * Authorization: Bearer <token>
 *
 * Sample Response:
 * {
 *   "success": true,
 *   "orders": [...]
 * }
 */
const getUserOrders = async (req, res) => {
  try {
    const userId = req.user.id;

    const orders = await prisma.order.findMany({
      where: { userId },
      include: {
        orderItems: {
          include: {
            product: true
          }
        },
        payment: true
      },
      orderBy: { createdAt: 'desc' }
    });

    return res.status(200).json({
      success: true,
      orders
    });

  } catch (error) {
    console.error('Get Orders Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch orders',
      error: error.message
    });
  }
};

/**
 * Get Order by ID
 *
 * Sample Request:
 * GET /api/orders/:id
 * Authorization: Bearer <token>
 *
 * Sample Response:
 * {
 *   "success": true,
 *   "order": {...}
 * }
 */
const getOrderById = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const order = await prisma.order.findUnique({
      where: { id },
      include: {
        orderItems: {
          include: {
            product: true
          }
        },
        payment: true
      }
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    if (order.userId !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized access'
      });
    }

    return res.status(200).json({
      success: true,
      order
    });

  } catch (error) {
    console.error('Get Order Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch order',
      error: error.message
    });
  }
};

/**
 * Cancel Order
 *
 * Business Logic:
 * - If order is cancelled, increment stock_quantity
 *
 * Sample Request:
 * PUT /api/orders/:id/cancel
 * Authorization: Bearer <token>
 *
 * Sample Response:
 * {
 *   "success": true,
 *   "message": "Order cancelled successfully",
 *   "order": {...}
 * }
 */
const cancelOrder = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const order = await prisma.order.findUnique({
      where: { id },
      include: {
        orderItems: true
      }
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    if (order.userId !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized access'
      });
    }

    if (order.status === 'CANCELLED') {
      return res.status(400).json({
        success: false,
        message: 'Order is already cancelled'
      });
    }

    if (order.status === 'DELIVERED') {
      return res.status(400).json({
        success: false,
        message: 'Cannot cancel delivered order'
      });
    }

    // Restore stock quantities (Inventory Management)
    for (const item of order.orderItems) {
      await prisma.product.update({
        where: { id: item.productId },
        data: {
          stockQuantity: {
            increment: item.quantity
          }
        }
      });
    }

    const updatedOrder = await prisma.order.update({
      where: { id },
      data: {
        status: 'CANCELLED'
      },
      include: {
        orderItems: {
          include: {
            product: true
          }
        },
        payment: true
      }
    });

    return res.status(200).json({
      success: true,
      message: 'Order cancelled successfully',
      order: updatedOrder
    });

  } catch (error) {
    console.error('Cancel Order Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to cancel order',
      error: error.message
    });
  }
};

/**
 * Update Order Status (ADMIN ONLY)
 *
 * Sample Request:
 * PUT /api/admin/orders/:id/status
 * Authorization: Bearer <admin_token>
 * Body: { "status": "SHIPPED", "trackingId": "TRACK123" }
 *
 * Sample Response:
 * {
 *   "success": true,
 *   "message": "Order status updated",
 *   "order": {...}
 * }
 */
const updateOrderStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, trackingId } = req.body;

    const validStatuses = ['PENDING', 'PAID', 'SHIPPED', 'DELIVERED', 'CANCELLED'];

    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status value'
      });
    }

    const updateData = { status };
    if (trackingId) {
      updateData.deliveryTrackingId = trackingId;
    }

    const order = await prisma.order.update({
      where: { id },
      data: updateData,
      include: {
        orderItems: {
          include: {
            product: true
          }
        },
        payment: true
      }
    });

    return res.status(200).json({
      success: true,
      message: 'Order status updated',
      order
    });

  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    console.error('Update Order Status Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update order status',
      error: error.message
    });
  }
};

module.exports = {
  createOrder,
  verifyPayment,
  getUserOrders,
  getOrderById,
  cancelOrder,
  updateOrderStatus
};
