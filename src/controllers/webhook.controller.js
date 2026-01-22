const { prisma } = require('../config/database');
const crypto = require('crypto');

/**
 * Shiprocket Webhook Handler
 *
 * Receives real-time updates from Shiprocket about shipment status
 *
 * Events:
 * - Order Created
 * - Pickup Scheduled
 * - Dispatched
 * - In Transit
 * - Out for Delivery
 * - Delivered
 * - RTO (Return to Origin)
 * - Cancelled
 *
 * Sample Webhook Payload:
 * {
 *   "shipment_id": 12345,
 *   "awb_code": "AWB123456",
 *   "current_status": "Delivered",
 *   "courier_name": "Blue Dart",
 *   "edd": "2024-01-20",
 *   "pickup_date": "2024-01-15",
 *   "delivered_date": "2024-01-19"
 * }
 */
const handleShiprocketWebhook = async (req, res) => {
  try {
    const webhookData = req.body;

    // Verify webhook signature if secret is configured
    if (process.env.SHIPROCKET_WEBHOOK_SECRET) {
      const signature = req.headers['x-shiprocket-signature'];
      const expectedSignature = crypto
        .createHmac('sha256', process.env.SHIPROCKET_WEBHOOK_SECRET)
        .update(JSON.stringify(webhookData))
        .digest('hex');

      if (signature !== expectedSignature) {
        console.error('Invalid webhook signature');
        return res.status(401).json({
          success: false,
          message: 'Invalid signature'
        });
      }
    }

    console.log('Shiprocket Webhook Received:', webhookData);

    const {
      shipment_id,
      awb_code,
      current_status,
      courier_name,
      edd,
      pickup_date,
      delivered_date,
      tracking_url
    } = webhookData;

    // Find shipping details by shiprocket shipment ID or AWB code
    const shippingDetails = await prisma.shippingDetails.findFirst({
      where: {
        OR: [
          { shiprocketShipmentId: shipment_id?.toString() },
          { awbCode: awb_code }
        ]
      },
      include: {
        order: true
      }
    });

    if (!shippingDetails) {
      console.warn('Shipping details not found for webhook:', { shipment_id, awb_code });
      return res.status(404).json({
        success: false,
        message: 'Shipping details not found'
      });
    }

    // Map Shiprocket status to our ShipmentStatus enum
    const statusMap = {
      'New': 'PENDING',
      'Pickup Scheduled': 'PROCESSING',
      'Picked Up': 'DISPATCHED',
      'Shipped': 'DISPATCHED',
      'In Transit': 'IN_TRANSIT',
      'Out For Delivery': 'OUT_FOR_DELIVERY',
      'Delivered': 'DELIVERED',
      'Cancelled': 'CANCELLED',
      'RTO Initiated': 'RTO_INITIATED',
      'RTO Delivered': 'RTO_DELIVERED',
      'Lost': 'FAILED',
      'Damaged': 'FAILED'
    };

    const mappedStatus = statusMap[current_status] || 'IN_TRANSIT';

    // Get current status history
    const currentHistory = shippingDetails.statusHistory || [];

    // Add new status update to history
    const updatedHistory = [
      ...currentHistory,
      {
        status: current_status,
        timestamp: new Date().toISOString(),
        courierName: courier_name,
        awbCode: awb_code
      }
    ];

    // Update shipping details
    const updateData = {
      currentStatus: mappedStatus,
      courierName: courier_name || shippingDetails.courierName,
      awbCode: awb_code || shippingDetails.awbCode,
      trackingUrl: tracking_url || shippingDetails.trackingUrl,
      statusHistory: updatedHistory
    };

    if (edd) {
      updateData.estimatedDeliveryDate = new Date(edd);
    }

    if (pickup_date) {
      updateData.pickupScheduledDate = new Date(pickup_date);
    }

    if (current_status.includes('Picked') || current_status.includes('Dispatch')) {
      updateData.dispatchedDate = new Date();
    }

    if (delivered_date || current_status === 'Delivered') {
      updateData.deliveredDate = delivered_date ? new Date(delivered_date) : new Date();
    }

    await prisma.shippingDetails.update({
      where: { id: shippingDetails.id },
      data: updateData
    });

    // Update order status based on shipment status
    const orderStatusMap = {
      'PROCESSING': 'PAID',
      'DISPATCHED': 'SHIPPED',
      'IN_TRANSIT': 'SHIPPED',
      'OUT_FOR_DELIVERY': 'SHIPPED',
      'DELIVERED': 'DELIVERED',
      'CANCELLED': 'CANCELLED'
    };

    const newOrderStatus = orderStatusMap[mappedStatus];
    if (newOrderStatus && shippingDetails.order.status !== newOrderStatus) {
      await prisma.order.update({
        where: { id: shippingDetails.orderId },
        data: {
          status: newOrderStatus,
          ...(newOrderStatus === 'DELIVERED' && {
            deliveryTrackingId: awb_code
          })
        }
      });
    }

    console.log(`Webhook processed: Order ${shippingDetails.orderId} -> ${mappedStatus}`);

    return res.status(200).json({
      success: true,
      message: 'Webhook processed successfully'
    });

  } catch (error) {
    console.error('Webhook Handler Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to process webhook',
      error: error.message
    });
  }
};

/**
 * Razorpay Payment Webhook Handler
 *
 * Handles payment events from Razorpay
 * (Optional - for additional payment event handling)
 */
const handleRazorpayWebhook = async (req, res) => {
  try {
    const webhookData = req.body;
    const webhookSignature = req.headers['x-razorpay-signature'];

    // Verify webhook signature
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET || '')
      .update(JSON.stringify(webhookData))
      .digest('hex');

    if (webhookSignature !== expectedSignature) {
      return res.status(401).json({
        success: false,
        message: 'Invalid signature'
      });
    }

    console.log('Razorpay Webhook:', webhookData.event);

    const { event, payload } = webhookData;

    // Handle different events
    switch (event) {
      case 'payment.captured':
        // Payment successful
        console.log('Payment captured:', payload.payment.entity.id);
        break;

      case 'payment.failed':
        // Payment failed
        console.log('Payment failed:', payload.payment.entity.id);
        break;

      case 'refund.created':
        // Refund initiated
        const refundId = payload.refund.entity.id;
        const paymentId = payload.refund.entity.payment_id;

        // Update refund status in database
        await prisma.refund.updateMany({
          where: {
            razorpayRefundId: refundId
          },
          data: {
            status: 'PROCESSING'
          }
        });
        break;

      case 'refund.processed':
        // Refund completed
        await prisma.refund.updateMany({
          where: {
            razorpayRefundId: payload.refund.entity.id
          },
          data: {
            status: 'COMPLETED',
            completedAt: new Date()
          }
        });
        break;

      default:
        console.log('Unhandled event:', event);
    }

    return res.status(200).json({
      success: true,
      message: 'Webhook processed'
    });

  } catch (error) {
    console.error('Razorpay Webhook Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to process webhook',
      error: error.message
    });
  }
};

module.exports = {
  handleShiprocketWebhook,
  handleRazorpayWebhook
};
