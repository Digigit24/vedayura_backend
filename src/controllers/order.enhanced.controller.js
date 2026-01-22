const { prisma } = require('../config/database');
const { razorpayInstance } = require('../config/razorpay');
const shiprocketClient = require('../config/shiprocket');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

/**
 * Create Order / Checkout with Shipping Integration
 *
 * Enhanced with:
 * - Shipping cost calculation
 * - Idempotency key for double payment prevention
 * - Address snapshot storage
 * - Inventory management
 *
 * Sample Request:
 * POST /api/orders/checkout
 * Authorization: Bearer <token>
 * Body:
 * {
 *   "addressId": "uuid",
 *   "idempotencyKey": "unique-key-123" (optional, auto-generated if not provided)
 * }
 *
 * Sample Response:
 * {
 *   "success": true,
 *   "message": "Order created successfully",
 *   "order": {
 *     "id": "uuid",
 *     "razorpayOrderId": "order_xyz123",
 *     "subtotal": 1400,
 *     "shippingCost": 50,
 *     "totalAmount": 1450,
 *     "currency": "INR"
 *   },
 *   "razorpayKeyId": "rzp_test_xxxxx"
 * }
 */
const createOrder = async (req, res) => {
  try {
    const userId = req.user.id;
    const { addressId, idempotencyKey: providedKey } = req.body;

    if (!addressId) {
      return res.status(400).json({
        success: false,
        message: 'Address ID is required'
      });
    }

    // Generate or use provided idempotency key
    const idempotencyKey = providedKey || `${userId}_${Date.now()}_${uuidv4()}`;

    // Check for existing order with this idempotency key (prevent double payment)
    const existingPayment = await prisma.payment.findUnique({
      where: { idempotencyKey },
      include: {
        order: true
      }
    });

    if (existingPayment) {
      return res.status(200).json({
        success: true,
        message: 'Order already exists',
        order: {
          id: existingPayment.order.id,
          razorpayOrderId: existingPayment.razorpayOrderId,
          subtotal: parseFloat(existingPayment.order.subtotalAmount),
          shippingCost: parseFloat(existingPayment.order.shippingCost),
          totalAmount: parseFloat(existingPayment.order.totalAmount),
          currency: 'INR'
        },
        razorpayKeyId: process.env.RAZORPAY_KEY_ID,
        note: 'This order was already created'
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

    // Calculate subtotal and verify stock
    let subtotal = 0;
    let totalWeight = 0;
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

      subtotal += parseFloat(product.discountedPrice) * item.quantity;
      totalWeight += 0.5 * item.quantity; // Assuming 0.5kg per product

      orderItems.push({
        productId: product.id,
        quantity: item.quantity,
        priceAtPurchase: product.discountedPrice,
        name: product.name
      });
    }

    // Calculate shipping cost using Shiprocket
    let shippingCost = 0;
    let courierName = null;
    const pickupPincode = process.env.SHIPROCKET_PICKUP_PINCODE || '400001';

    try {
      const serviceability = await shiprocketClient.checkServiceability({
        pickupPincode,
        deliveryPincode: address.pincode,
        weightKg: totalWeight,
        codAmount: 0 // Prepaid
      });

      if (serviceability.available) {
        shippingCost = serviceability.shippingCost;
        courierName = serviceability.courierName;
      } else {
        return res.status(400).json({
          success: false,
          message: 'Shipping not available to your location. Please try a different address.',
          details: serviceability.message
        });
      }
    } catch (shippingError) {
      console.warn('Shipping calculation failed, proceeding with default cost:', shippingError.message);
      shippingCost = 50; // Default shipping cost if Shiprocket fails
    }

    const totalAmount = subtotal + shippingCost;

    // Create Razorpay Order
    const razorpayOrder = await razorpayInstance.orders.create({
      amount: Math.round(totalAmount * 100), // Amount in paise
      currency: 'INR',
      receipt: `receipt_${Date.now()}`,
      notes: {
        idempotencyKey,
        userId,
        addressId
      }
    });

    // Create address snapshot
    const addressSnapshot = {
      street: address.street,
      city: address.city,
      state: address.state,
      pincode: address.pincode,
      country: address.country
    };

    // Create order in database with shipping details
    const order = await prisma.order.create({
      data: {
        userId,
        subtotalAmount: subtotal,
        shippingCost,
        totalAmount,
        status: 'PENDING',
        shippingAddressSnapshot: addressSnapshot,
        pickupPincode,
        deliveryPincode: address.pincode,
        weightKg: totalWeight,
        lengthCm: 20,
        breadthCm: 15,
        heightCm: 10,
        orderItems: {
          create: orderItems
        },
        payment: {
          create: {
            razorpayOrderId: razorpayOrder.id,
            idempotencyKey,
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
        subtotal,
        shippingCost,
        totalAmount,
        currency: 'INR',
        courierName,
        estimatedWeight: totalWeight
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
 * Verify Payment and Create Shipment
 *
 * Enhanced with:
 * - Signature verification
 * - Shiprocket order creation
 * - AWB generation
 * - Pickup request
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
 *   "message": "Payment verified and shipment created successfully",
 *   "order": {...},
 *   "shipping": {
 *     "shiprocketOrderId": 12345,
 *     "awbCode": "AWB123456",
 *     "courierName": "Blue Dart",
 *     "trackingUrl": "..."
 *   }
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
        payment: true,
        orderItems: {
          include: {
            product: true
          }
        }
      }
    });

    if (!order || order.userId !== userId) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Check if already verified
    if (order.payment.status === 'SUCCESS') {
      return res.status(200).json({
        success: true,
        message: 'Payment already verified',
        order
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
          razorpayPaymentId,
          status: 'FAILED'
        }
      });

      return res.status(400).json({
        success: false,
        message: 'Payment verification failed. Signature mismatch.'
      });
    }

    // Update payment status
    await prisma.payment.update({
      where: { id: order.payment.id },
      data: {
        razorpayPaymentId,
        razorpaySignature,
        status: 'SUCCESS'
      }
    });

    // Update order status
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

    // Create Shiprocket order
    let shippingDetails = null;
    try {
      // Get user details
      const user = await prisma.user.findUnique({
        where: { id: userId }
      });

      const address = updatedOrder.shippingAddressSnapshot;
      const userName = user.name.split(' ');

      const shiprocketOrderData = {
        orderId: updatedOrder.id,
        orderDate: new Date().toISOString().split('T')[0],
        customerName: userName[0] || 'Customer',
        customerLastName: userName.slice(1).join(' ') || '',
        customerEmail: user.email,
        customerPhone: user.phone || '0000000000',
        billingAddress: address,
        subtotal: parseFloat(updatedOrder.subtotalAmount),
        weight: parseFloat(updatedOrder.weightKg),
        dimensions: {
          length: parseFloat(updatedOrder.lengthCm),
          breadth: parseFloat(updatedOrder.breadthCm),
          height: parseFloat(updatedOrder.heightCm)
        },
        items: updatedOrder.orderItems.map(item => ({
          name: item.product.name,
          productId: item.productId,
          quantity: item.quantity,
          price: parseFloat(item.priceAtPurchase)
        })),
        paymentMethod: 'Prepaid'
      };

      const shiprocketOrder = await shiprocketClient.createOrder(shiprocketOrderData);

      if (shiprocketOrder.success) {
        // Get available couriers
        const couriers = await shiprocketClient.getAvailableCouriers(shiprocketOrder.shipmentId);
        const selectedCourier = couriers.length > 0 ? couriers[0] : null;

        let awbDetails = null;
        if (selectedCourier) {
          // Generate AWB
          awbDetails = await shiprocketClient.generateAWB(
            shiprocketOrder.shipmentId,
            selectedCourier.id
          );

          // Request pickup
          await shiprocketClient.requestPickup(shiprocketOrder.shipmentId);
        }

        // Save shipping details
        shippingDetails = await prisma.shippingDetails.create({
          data: {
            orderId: updatedOrder.id,
            shiprocketOrderId: shiprocketOrder.orderId.toString(),
            shiprocketShipmentId: shiprocketOrder.shipmentId.toString(),
            awbCode: awbDetails?.awbCode || null,
            courierName: awbDetails?.courierName || selectedCourier?.name || null,
            currentStatus: 'PROCESSING'
          }
        });
      }
    } catch (shipError) {
      console.error('Shiprocket Error (non-blocking):', shipError.message);
      // Continue even if Shiprocket fails - can be created manually later
    }

    return res.status(200).json({
      success: true,
      message: shippingDetails
        ? 'Payment verified and shipment created successfully'
        : 'Payment verified successfully. Shipment will be processed shortly.',
      order: updatedOrder,
      shipping: shippingDetails ? {
        shiprocketOrderId: shippingDetails.shiprocketOrderId,
        awbCode: shippingDetails.awbCode,
        courierName: shippingDetails.courierName,
        status: shippingDetails.currentStatus
      } : null
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
 * Get User Orders with Shipping Details
 *
 * Sample Request:
 * GET /api/orders
 * Authorization: Bearer <token>
 *
 * Sample Response:
 * {
 *   "success": true,
 *   "orders": [{...}, {...}]
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
        payment: true,
        shippingDetails: true
      },
      orderBy: { createdAt: 'desc' }
    });

    return res.status(200).json({
      success: true,
      orders: orders.map(order => ({
        ...order,
        subtotalAmount: parseFloat(order.subtotalAmount),
        shippingCost: parseFloat(order.shippingCost),
        totalAmount: parseFloat(order.totalAmount)
      }))
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
 * Get Order by ID with Full Details
 *
 * Sample Request:
 * GET /api/orders/:id
 * Authorization: Bearer <token>
 *
 * Sample Response:
 * {
 *   "success": true,
 *   "order": {...},
 *   "tracking": {...}
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
        payment: true,
        shippingDetails: true
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
      order: {
        ...order,
        subtotalAmount: parseFloat(order.subtotalAmount),
        shippingCost: parseFloat(order.shippingCost),
        totalAmount: parseFloat(order.totalAmount)
      }
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
 * Track Order Shipment
 *
 * Sample Request:
 * GET /api/orders/:id/track
 * Authorization: Bearer <token>
 *
 * Sample Response:
 * {
 *   "success": true,
 *   "tracking": {
 *     "awbCode": "AWB123456",
 *     "courierName": "Blue Dart",
 *     "currentStatus": "IN_TRANSIT",
 *     "trackingUrl": "...",
 *     "estimatedDeliveryDate": "2024-01-20",
 *     "shipmentHistory": [...]
 *   }
 * }
 */
const trackOrder = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const order = await prisma.order.findUnique({
      where: { id },
      include: {
        shippingDetails: true
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

    if (!order.shippingDetails || !order.shippingDetails.shiprocketShipmentId) {
      return res.status(400).json({
        success: false,
        message: 'Shipment not yet created for this order'
      });
    }

    // Get live tracking from Shiprocket
    const tracking = await shiprocketClient.trackShipment(
      parseInt(order.shippingDetails.shiprocketShipmentId)
    );

    if (tracking.success) {
      // Update local shipping details with latest info
      await prisma.shippingDetails.update({
        where: { orderId: id },
        data: {
          trackingUrl: tracking.trackingUrl,
          estimatedDeliveryDate: tracking.estimatedDeliveryDate
            ? new Date(tracking.estimatedDeliveryDate)
            : null,
          statusHistory: tracking.shipmentTrackActivities || []
        }
      });

      return res.status(200).json({
        success: true,
        tracking: {
          awbCode: tracking.awbCode,
          courierName: tracking.courierName,
          currentStatus: tracking.currentStatus,
          trackingUrl: tracking.trackingUrl,
          estimatedDeliveryDate: tracking.estimatedDeliveryDate,
          shipmentHistory: tracking.shipmentTrackActivities
        }
      });
    }

    return res.status(200).json({
      success: false,
      message: 'Tracking information not available yet'
    });

  } catch (error) {
    console.error('Track Order Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to track order',
      error: error.message
    });
  }
};

/**
 * Cancel Order with Inventory Restoration
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
        orderItems: true,
        shippingDetails: true
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
        message: 'Cannot cancel delivered order. Please request a refund instead.'
      });
    }

    if (order.status === 'SHIPPED') {
      return res.status(400).json({
        success: false,
        message: 'Order has been shipped. Please contact support for cancellation.'
      });
    }

    // Cancel shipment in Shiprocket if exists
    if (order.shippingDetails?.awbCode) {
      try {
        await shiprocketClient.cancelShipment([order.shippingDetails.awbCode]);

        await prisma.shippingDetails.update({
          where: { orderId: id },
          data: {
            currentStatus: 'CANCELLED'
          }
        });
      } catch (shipError) {
        console.error('Shiprocket cancellation error:', shipError.message);
        // Continue with order cancellation even if Shiprocket fails
      }
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
        payment: true,
        shippingDetails: true
      }
    });

    return res.status(200).json({
      success: true,
      message: 'Order cancelled successfully. Stock has been restored.',
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
        payment: true,
        shippingDetails: true
      }
    });

    // Update shipping details status if applicable
    if (order.shippingDetails) {
      const shipmentStatusMap = {
        'PENDING': 'PENDING',
        'PAID': 'PROCESSING',
        'SHIPPED': 'DISPATCHED',
        'DELIVERED': 'DELIVERED',
        'CANCELLED': 'CANCELLED'
      };

      await prisma.shippingDetails.update({
        where: { orderId: id },
        data: {
          currentStatus: shipmentStatusMap[status],
          ...(status === 'DISPATCHED' && { dispatchedDate: new Date() }),
          ...(status === 'DELIVERED' && { deliveredDate: new Date() })
        }
      });
    }

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
  trackOrder,
  cancelOrder,
  updateOrderStatus
};
