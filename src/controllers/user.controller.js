const { prisma } = require('../config/database');
const { validationResult } = require('express-validator');

/**
 * Get All User Addresses
 *
 * Sample Request:
 * GET /api/users/addresses
 * Authorization: Bearer <token>
 *
 * Sample Response:
 * {
 *   "success": true,
 *   "addresses": [
 *     {
 *       "id": "uuid",
 *       "street": "123 MG Road",
 *       "city": "Pune",
 *       "state": "Maharashtra",
 *       "pincode": "411057",
 *       "country": "India",
 *       "isDefault": true
 *     }
 *   ]
 * }
 */
const getAddresses = async (req, res) => {
  try {
    const userId = req.user.id;

    const addresses = await prisma.address.findMany({
      where: { userId },
      orderBy: { isDefault: 'desc' }
    });

    return res.status(200).json({
      success: true,
      addresses
    });

  } catch (error) {
    console.error('Get Addresses Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch addresses',
      error: error.message
    });
  }
};

/**
 * Add New Address
 *
 * Sample Request:
 * POST /api/users/address
 * Authorization: Bearer <token>
 * Body:
 * {
 *   "street": "123 MG Road",
 *   "city": "Pune",
 *   "state": "Maharashtra",
 *   "pincode": "411057",
 *   "country": "India",
 *   "isDefault": false
 * }
 *
 * Sample Response:
 * {
 *   "success": true,
 *   "message": "Address added successfully",
 *   "address": {...}
 * }
 */
const addAddress = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const userId = req.user.id;
    const { street, city, state, pincode, country = 'India', isDefault = false } = req.body;

    // If this is set as default, unset other default addresses
    if (isDefault) {
      await prisma.address.updateMany({
        where: {
          userId,
          isDefault: true
        },
        data: {
          isDefault: false
        }
      });
    }

    // If this is the first address, make it default
    const existingAddresses = await prisma.address.count({
      where: { userId }
    });

    const address = await prisma.address.create({
      data: {
        userId,
        street,
        city,
        state,
        pincode,
        country,
        isDefault: isDefault || existingAddresses === 0
      }
    });

    return res.status(201).json({
      success: true,
      message: 'Address added successfully',
      address
    });

  } catch (error) {
    console.error('Add Address Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to add address',
      error: error.message
    });
  }
};

/**
 * Update Address
 *
 * Sample Request:
 * PUT /api/users/address/:id
 * Authorization: Bearer <token>
 * Body: { "street": "Updated Street", "isDefault": true }
 *
 * Sample Response:
 * {
 *   "success": true,
 *   "message": "Address updated successfully",
 *   "address": {...}
 * }
 */
const updateAddress = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const updateData = req.body;

    // Verify address belongs to user
    const existingAddress = await prisma.address.findUnique({
      where: { id }
    });

    if (!existingAddress) {
      return res.status(404).json({
        success: false,
        message: 'Address not found'
      });
    }

    if (existingAddress.userId !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized access'
      });
    }

    // If setting as default, unset other default addresses
    if (updateData.isDefault) {
      await prisma.address.updateMany({
        where: {
          userId,
          isDefault: true,
          id: { not: id }
        },
        data: {
          isDefault: false
        }
      });
    }

    const address = await prisma.address.update({
      where: { id },
      data: updateData
    });

    return res.status(200).json({
      success: true,
      message: 'Address updated successfully',
      address
    });

  } catch (error) {
    console.error('Update Address Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update address',
      error: error.message
    });
  }
};

/**
 * Delete Address
 *
 * Sample Request:
 * DELETE /api/users/address/:id
 * Authorization: Bearer <token>
 *
 * Sample Response:
 * {
 *   "success": true,
 *   "message": "Address deleted successfully"
 * }
 */
const deleteAddress = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const address = await prisma.address.findUnique({
      where: { id }
    });

    if (!address) {
      return res.status(404).json({
        success: false,
        message: 'Address not found'
      });
    }

    if (address.userId !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized access'
      });
    }

    const wasDefault = address.isDefault;

    await prisma.address.delete({
      where: { id }
    });

    // If deleted address was default, set another as default
    if (wasDefault) {
      const firstAddress = await prisma.address.findFirst({
        where: { userId },
        orderBy: { createdAt: 'asc' }
      });

      if (firstAddress) {
        await prisma.address.update({
          where: { id: firstAddress.id },
          data: { isDefault: true }
        });
      }
    }

    return res.status(200).json({
      success: true,
      message: 'Address deleted successfully'
    });

  } catch (error) {
    console.error('Delete Address Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete address',
      error: error.message
    });
  }
};

module.exports = {
  getAddresses,
  addAddress,
  updateAddress,
  deleteAddress
};
