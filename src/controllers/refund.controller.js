const { prisma } = require('../config/database');
const Razorpay = require('razorpay');

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

/**
 * USER SIDE - Request Refund
 *
 * Sample Request:
 * POST /api/refunds/request
 * Authorization: Bearer <token>
 * Content-Type: application/json
 * Body:
 * {
 *   "orderId": "order-uuid",
 *   "reason": "Product damaged",
 *   "userNote": "The package arrived with damaged seal"
 * }
 *
 * Sample Response:
 * {
 *   "success": true,
 *   "message": "Refund request submitted successfully",
 *   "refund": {
 *     "id": "refund-uuid",
 *     "orderId": "order-uuid",
 *     "amount": 1500,
 *     "status": "REQUESTED",
 *     "requestedAt": "2024-01-15T10:30:00.000Z"
 *   }
 * }
 */
const requestRefund = async (req, res) => {
  try {
    const userId = req.user.id;
    const { orderId, reason, userNote } = req.body;

    if (!orderId || !reason) {
      return res.status(400).json({
        success: false,
        message: 'Order ID and reason are required'
      });
    }

    // Verify order exists and belongs to user
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        payment: true,
        refunds: true
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
        message: 'Unauthorized access to this order'
      });
    }

    // Check if order is paid
    if (!order.payment || order.payment.status !== 'SUCCESS') {
      return res.status(400).json({
        success: false,
        message: 'Refund can only be requested for paid orders'
      });
    }

    // Check if refund already exists
    const existingRefund = order.refunds.find(
      r => ['REQUESTED', 'PENDING_ADMIN_APPROVAL', 'APPROVED', 'PROCESSING'].includes(r.status)
    );

    if (existingRefund) {
      return res.status(400).json({
        success: false,
        message: 'A refund request already exists for this order',
        existingRefund: {
          id: existingRefund.id,
          status: existingRefund.status,
          requestedAt: existingRefund.requestedAt
        }
      });
    }

    // Calculate refundable amount (total - already refunded)
    const refundableAmount = parseFloat(order.payment.amount) - parseFloat(order.payment.amountRefunded);

    if (refundableAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'This order has already been fully refunded'
      });
    }

    // Create refund request
    const refund = await prisma.refund.create({
      data: {
        orderId,
        userId,
        amount: refundableAmount,
        reason,
        userNote: userNote || null,
        status: 'REQUESTED'
      }
    });

    return res.status(201).json({
      success: true,
      message: 'Refund request submitted successfully. Our admin team will review it shortly.',
      refund: {
        id: refund.id,
        orderId: refund.orderId,
        amount: parseFloat(refund.amount),
        reason: refund.reason,
        status: refund.status,
        requestedAt: refund.requestedAt
      }
    });

  } catch (error) {
    console.error('Request Refund Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to submit refund request',
      error: error.message
    });
  }
};

/**
 * USER SIDE - Get My Refund Requests
 *
 * Sample Request:
 * GET /api/refunds/my-requests
 * Authorization: Bearer <token>
 *
 * Sample Response:
 * {
 *   "success": true,
 *   "refunds": [...]
 * }
 */
const getMyRefundRequests = async (req, res) => {
  try {
    const userId = req.user.id;

    const refunds = await prisma.refund.findMany({
      where: { userId },
      include: {
        order: {
          select: {
            id: true,
            totalAmount: true,
            createdAt: true,
            status: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    return res.status(200).json({
      success: true,
      refunds: refunds.map(r => ({
        id: r.id,
        orderId: r.orderId,
        amount: parseFloat(r.amount),
        reason: r.reason,
        userNote: r.userNote,
        adminNote: r.adminNote,
        status: r.status,
        requestedAt: r.requestedAt,
        approvedRejectedAt: r.approvedRejectedAt,
        completedAt: r.completedAt,
        order: r.order
      }))
    });

  } catch (error) {
    console.error('Get My Refunds Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch refund requests',
      error: error.message
    });
  }
};

/**
 * ADMIN SIDE - Get All Refund Requests
 *
 * Sample Request:
 * GET /api/admin/refunds?status=REQUESTED
 * Authorization: Bearer <admin_token>
 *
 * Sample Response:
 * {
 *   "success": true,
 *   "refunds": [...],
 *   "total": 25
 * }
 */
const getAllRefundRequests = async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const where = status ? { status } : {};

    const [refunds, total] = await Promise.all([
      prisma.refund.findMany({
        where,
        skip,
        take: parseInt(limit),
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true
            }
          },
          order: {
            include: {
              payment: true
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      }),
      prisma.refund.count({ where })
    ]);

    return res.status(200).json({
      success: true,
      refunds: refunds.map(r => ({
        id: r.id,
        orderId: r.orderId,
        razorpayRefundId: r.razorpayRefundId,
        amount: parseFloat(r.amount),
        reason: r.reason,
        userNote: r.userNote,
        adminNote: r.adminNote,
        status: r.status,
        requestedAt: r.requestedAt,
        approvedRejectedAt: r.approvedRejectedAt,
        completedAt: r.completedAt,
        user: r.user,
        order: {
          id: r.order.id,
          totalAmount: parseFloat(r.order.totalAmount),
          status: r.order.status,
          razorpayPaymentId: r.order.payment?.razorpayPaymentId
        }
      })),
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });

  } catch (error) {
    console.error('Get All Refunds Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch refund requests',
      error: error.message
    });
  }
};

/**
 * ADMIN SIDE - Approve Refund
 *
 * Sample Request:
 * POST /api/admin/refunds/:id/approve
 * Authorization: Bearer <admin_token>
 * Content-Type: application/json
 * Body:
 * {
 *   "adminNote": "Approved as product was damaged"
 * }
 *
 * Sample Response:
 * {
 *   "success": true,
 *   "message": "Refund approved and processed successfully",
 *   "refund": {...},
 *   "razorpayRefund": {...}
 * }
 */
const approveRefund = async (req, res) => {
  try {
    const { id } = req.params;
    const { adminNote } = req.body;
    const adminId = req.user.id;

    const refund = await prisma.refund.findUnique({
      where: { id },
      include: {
        order: {
          include: {
            payment: true
          }
        }
      }
    });

    if (!refund) {
      return res.status(404).json({
        success: false,
        message: 'Refund request not found'
      });
    }

    if (refund.status !== 'REQUESTED') {
      return res.status(400).json({
        success: false,
        message: `Cannot approve refund with status: ${refund.status}`
      });
    }

    const payment = refund.order.payment;

    if (!payment || !payment.razorpayPaymentId) {
      return res.status(400).json({
        success: false,
        message: 'Payment information not found for this order'
      });
    }

    // Process refund with Razorpay
    try {
      const razorpayRefund = await razorpay.payments.refund(payment.razorpayPaymentId, {
        amount: Math.round(parseFloat(refund.amount) * 100), // Convert to paise
        speed: 'normal',
        notes: {
          refund_id: refund.id,
          order_id: refund.orderId,
          reason: refund.reason
        }
      });

      // Update refund in database
      const updatedRefund = await prisma.$transaction(async (tx) => {
        // Update refund
        const updated = await tx.refund.update({
          where: { id },
          data: {
            status: 'PROCESSING',
            razorpayRefundId: razorpayRefund.id,
            adminNote: adminNote || null,
            approvedRejectedAt: new Date(),
            approvedByAdminId: adminId,
            processedAt: new Date()
          }
        });

        // Update payment
        await tx.payment.update({
          where: { id: payment.id },
          data: {
            amountRefunded: {
              increment: parseFloat(refund.amount)
            },
            status: parseFloat(payment.amount) === parseFloat(refund.amount) + parseFloat(payment.amountRefunded)
              ? 'REFUNDED'
              : 'PARTIALLY_REFUNDED'
          }
        });

        return updated;
      });

      return res.status(200).json({
        success: true,
        message: 'Refund approved and initiated successfully. Amount will be credited in 5-7 business days.',
        refund: {
          id: updatedRefund.id,
          status: updatedRefund.status,
          razorpayRefundId: updatedRefund.razorpayRefundId,
          amount: parseFloat(updatedRefund.amount),
          approvedAt: updatedRefund.approvedRejectedAt
        },
        razorpayRefund: {
          id: razorpayRefund.id,
          status: razorpayRefund.status,
          amount: razorpayRefund.amount / 100,
          currency: razorpayRefund.currency
        }
      });

    } catch (razorpayError) {
      console.error('Razorpay Refund Error:', razorpayError);

      // Update refund status to failed
      await prisma.refund.update({
        where: { id },
        data: {
          status: 'FAILED',
          adminNote: `Failed: ${razorpayError.message}`,
          approvedRejectedAt: new Date(),
          approvedByAdminId: adminId
        }
      });

      return res.status(500).json({
        success: false,
        message: 'Failed to process refund with Razorpay',
        error: razorpayError.message
      });
    }

  } catch (error) {
    console.error('Approve Refund Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to approve refund',
      error: error.message
    });
  }
};

/**
 * ADMIN SIDE - Reject Refund
 *
 * Sample Request:
 * POST /api/admin/refunds/:id/reject
 * Authorization: Bearer <admin_token>
 * Content-Type: application/json
 * Body:
 * {
 *   "adminNote": "Product appears to be used, refund cannot be processed"
 * }
 *
 * Sample Response:
 * {
 *   "success": true,
 *   "message": "Refund request rejected",
 *   "refund": {...}
 * }
 */
const rejectRefund = async (req, res) => {
  try {
    const { id } = req.params;
    const { adminNote } = req.body;
    const adminId = req.user.id;

    if (!adminNote) {
      return res.status(400).json({
        success: false,
        message: 'Admin note is required when rejecting a refund'
      });
    }

    const refund = await prisma.refund.findUnique({
      where: { id }
    });

    if (!refund) {
      return res.status(404).json({
        success: false,
        message: 'Refund request not found'
      });
    }

    if (refund.status !== 'REQUESTED') {
      return res.status(400).json({
        success: false,
        message: `Cannot reject refund with status: ${refund.status}`
      });
    }

    const updatedRefund = await prisma.refund.update({
      where: { id },
      data: {
        status: 'REJECTED',
        adminNote,
        approvedRejectedAt: new Date(),
        approvedByAdminId: adminId
      }
    });

    return res.status(200).json({
      success: true,
      message: 'Refund request rejected',
      refund: {
        id: updatedRefund.id,
        status: updatedRefund.status,
        adminNote: updatedRefund.adminNote,
        rejectedAt: updatedRefund.approvedRejectedAt
      }
    });

  } catch (error) {
    console.error('Reject Refund Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to reject refund',
      error: error.message
    });
  }
};

/**
 * Check Razorpay Refund Status
 *
 * Updates refund status from Razorpay
 *
 * Sample Request:
 * GET /api/admin/refunds/:id/check-status
 * Authorization: Bearer <admin_token>
 */
const checkRefundStatus = async (req, res) => {
  try {
    const { id } = req.params;

    const refund = await prisma.refund.findUnique({
      where: { id },
      include: {
        order: {
          include: {
            payment: true
          }
        }
      }
    });

    if (!refund || !refund.razorpayRefundId) {
      return res.status(404).json({
        success: false,
        message: 'Refund not found or not yet processed'
      });
    }

    // Fetch refund status from Razorpay
    const razorpayRefund = await razorpay.payments.fetchRefund(
      refund.order.payment.razorpayPaymentId,
      refund.razorpayRefundId
    );

    // Update status if processed
    if (razorpayRefund.status === 'processed' && refund.status !== 'COMPLETED') {
      await prisma.refund.update({
        where: { id },
        data: {
          status: 'COMPLETED',
          completedAt: new Date()
        }
      });
    }

    return res.status(200).json({
      success: true,
      refund: {
        id: refund.id,
        localStatus: refund.status,
        razorpayStatus: razorpayRefund.status,
        amount: razorpayRefund.amount / 100,
        currency: razorpayRefund.currency,
        createdAt: new Date(razorpayRefund.created_at * 1000)
      }
    });

  } catch (error) {
    console.error('Check Refund Status Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to check refund status',
      error: error.message
    });
  }
};

module.exports = {
  // User endpoints
  requestRefund,
  getMyRefundRequests,

  // Admin endpoints
  getAllRefundRequests,
  approveRefund,
  rejectRefund,
  checkRefundStatus
};
