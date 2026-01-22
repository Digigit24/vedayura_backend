const shiprocketClient = require('../config/shiprocket');
const { prisma } = require('../config/database');

/**
 * Calculate Shipping Cost
 *
 * Sample Request:
 * POST /api/shipping/calculate
 * Authorization: Bearer <token>
 * Content-Type: application/json
 * Body:
 * {
 *   "deliveryPincode": "400001",
 *   "weightKg": 0.5,
 *   "codAmount": 0
 * }
 *
 * Sample Response:
 * {
 *   "success": true,
 *   "available": true,
 *   "shippingCost": 50.00,
 *   "estimatedDays": "2-3",
 *   "courierName": "Delhivery",
 *   "allCouriers": [...]
 * }
 */
const calculateShippingCost = async (req, res) => {
  try {
    const { deliveryPincode, weightKg, codAmount } = req.body;

    if (!deliveryPincode) {
      return res.status(400).json({
        success: false,
        message: 'Delivery pincode is required'
      });
    }

    const pickupPincode = process.env.SHIPROCKET_PICKUP_PINCODE || '400001';
    const weight = weightKg || 0.5; // Default 500g

    const serviceability = await shiprocketClient.checkServiceability({
      pickupPincode,
      deliveryPincode,
      weightKg: weight,
      codAmount: codAmount || 0
    });

    return res.status(200).json({
      success: true,
      ...serviceability
    });

  } catch (error) {
    console.error('Calculate Shipping Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to calculate shipping cost',
      error: error.message
    });
  }
};

/**
 * Calculate Shipping for Cart
 *
 * Automatically calculates weight from cart items and checks serviceability
 *
 * Sample Request:
 * POST /api/shipping/calculate-for-cart
 * Authorization: Bearer <token>
 * Content-Type: application/json
 * Body:
 * {
 *   "deliveryPincode": "400001"
 * }
 *
 * Sample Response:
 * {
 *   "success": true,
 *   "available": true,
 *   "shippingCost": 75.00,
 *   "estimatedDays": "3-4",
 *   "cartWeight": 1.2,
 *   "courierName": "Blue Dart"
 * }
 */
const calculateShippingForCart = async (req, res) => {
  try {
    const userId = req.user.id;
    const { deliveryPincode } = req.body;

    if (!deliveryPincode) {
      return res.status(400).json({
        success: false,
        message: 'Delivery pincode is required'
      });
    }

    // Get user's cart
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

    // Calculate total weight (assuming each product has a standard weight)
    // You can add a weight field to Product model for more accuracy
    const totalWeight = cart.cartItems.reduce((total, item) => {
      // Default: 0.5kg per product unit
      const itemWeight = 0.5;
      return total + (itemWeight * item.quantity);
    }, 0);

    const pickupPincode = process.env.SHIPROCKET_PICKUP_PINCODE || '400001';

    const serviceability = await shiprocketClient.checkServiceability({
      pickupPincode,
      deliveryPincode,
      weightKg: totalWeight,
      codAmount: 0 // Assuming prepaid
    });

    return res.status(200).json({
      success: true,
      cartWeight: totalWeight,
      ...serviceability
    });

  } catch (error) {
    console.error('Calculate Cart Shipping Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to calculate shipping cost for cart',
      error: error.message
    });
  }
};

/**
 * Get Pincode Serviceability
 *
 * Check if delivery is available to a specific pincode
 *
 * Sample Request:
 * GET /api/shipping/check-pincode/400001
 * Authorization: Bearer <token>
 *
 * Sample Response:
 * {
 *   "success": true,
 *   "available": true,
 *   "message": "Delivery available"
 * }
 */
const checkPincodeServiceability = async (req, res) => {
  try {
    const { pincode } = req.params;

    if (!pincode || pincode.length !== 6) {
      return res.status(400).json({
        success: false,
        message: 'Valid 6-digit pincode is required'
      });
    }

    const pickupPincode = process.env.SHIPROCKET_PICKUP_PINCODE || '400001';

    const serviceability = await shiprocketClient.checkServiceability({
      pickupPincode,
      deliveryPincode: pincode,
      weightKg: 0.5,
      codAmount: 0
    });

    return res.status(200).json({
      success: true,
      available: serviceability.available,
      message: serviceability.available
        ? 'Delivery available to this pincode'
        : 'Delivery not available to this pincode'
    });

  } catch (error) {
    console.error('Check Pincode Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to check pincode serviceability',
      error: error.message
    });
  }
};

module.exports = {
  calculateShippingCost,
  calculateShippingForCart,
  checkPincodeServiceability
};
