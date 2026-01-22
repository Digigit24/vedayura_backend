const axios = require('axios');

/**
 * Shiprocket API Client
 *
 * Provides integration with Shiprocket API for:
 * - Authentication
 * - Shipping cost calculation (serviceability check)
 * - Order creation and shipment
 * - Tracking and status updates
 * - AWB generation
 */

class ShiprocketClient {
  constructor() {
    this.baseURL = process.env.SHIPROCKET_API_BASE_URL || 'https://apiv2.shiprocket.in/v1/external';
    this.email = process.env.SHIPROCKET_EMAIL;
    this.password = process.env.SHIPROCKET_PASSWORD;
    this.token = null;
    this.tokenExpiry = null;
  }

  /**
   * Authenticate with Shiprocket and get access token
   */
  async authenticate() {
    try {
      // Return cached token if still valid
      if (this.token && this.tokenExpiry && new Date() < this.tokenExpiry) {
        return this.token;
      }

      const response = await axios.post(`${this.baseURL}/auth/login`, {
        email: this.email,
        password: this.password
      });

      this.token = response.data.token;
      // Token expires in 10 days, refresh 1 day before
      this.tokenExpiry = new Date(Date.now() + 9 * 24 * 60 * 60 * 1000);

      return this.token;
    } catch (error) {
      console.error('Shiprocket Authentication Error:', error.response?.data || error.message);
      throw new Error('Failed to authenticate with Shiprocket');
    }
  }

  /**
   * Get authenticated axios instance
   */
  async getAxiosInstance() {
    const token = await this.authenticate();
    return axios.create({
      baseURL: this.baseURL,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
  }

  /**
   * Check serviceability and calculate shipping cost
   *
   * @param {Object} params - Shipping parameters
   * @param {string} params.pickupPincode - Pickup location pincode
   * @param {string} params.deliveryPincode - Delivery location pincode
   * @param {number} params.weightKg - Package weight in kg
   * @param {number} params.codAmount - COD amount (0 for prepaid)
   * @returns {Promise<Object>} Shipping details including cost
   */
  async checkServiceability(params) {
    try {
      const api = await this.getAxiosInstance();

      const response = await api.get('/courier/serviceability', {
        params: {
          pickup_postcode: params.pickupPincode,
          delivery_postcode: params.deliveryPincode,
          weight: params.weightKg,
          cod: params.codAmount || 0
        }
      });

      if (response.data.status === 200 && response.data.data.available_courier_companies?.length > 0) {
        // Get the cheapest courier
        const couriers = response.data.data.available_courier_companies;
        const cheapestCourier = couriers.reduce((prev, curr) =>
          prev.rate < curr.rate ? prev : curr
        );

        return {
          available: true,
          shippingCost: parseFloat(cheapestCourier.rate),
          estimatedDays: cheapestCourier.etd,
          courierName: cheapestCourier.courier_name,
          courierId: cheapestCourier.courier_company_id,
          allCouriers: couriers.map(c => ({
            name: c.courier_name,
            id: c.courier_company_id,
            rate: parseFloat(c.rate),
            etd: c.etd
          }))
        };
      }

      return {
        available: false,
        message: 'Delivery not available for this location',
        shippingCost: 0
      };

    } catch (error) {
      console.error('Serviceability Check Error:', error.response?.data || error.message);
      throw new Error('Failed to check serviceability');
    }
  }

  /**
   * Create order in Shiprocket
   *
   * @param {Object} orderData - Order details
   * @returns {Promise<Object>} Created order details
   */
  async createOrder(orderData) {
    try {
      const api = await this.getAxiosInstance();

      const payload = {
        order_id: orderData.orderId,
        order_date: orderData.orderDate,
        pickup_location: process.env.SHIPROCKET_PICKUP_LOCATION || 'Primary',
        billing_customer_name: orderData.customerName,
        billing_last_name: orderData.customerLastName || '',
        billing_address: orderData.billingAddress.street,
        billing_city: orderData.billingAddress.city,
        billing_pincode: orderData.billingAddress.pincode,
        billing_state: orderData.billingAddress.state,
        billing_country: orderData.billingAddress.country || 'India',
        billing_email: orderData.customerEmail,
        billing_phone: orderData.customerPhone,
        shipping_is_billing: true,
        order_items: orderData.items.map(item => ({
          name: item.name,
          sku: item.sku || item.productId,
          units: item.quantity,
          selling_price: parseFloat(item.price)
        })),
        payment_method: orderData.paymentMethod || 'Prepaid',
        sub_total: parseFloat(orderData.subtotal),
        length: orderData.dimensions?.length || 10,
        breadth: orderData.dimensions?.breadth || 10,
        height: orderData.dimensions?.height || 10,
        weight: orderData.weight || 0.5
      };

      const response = await api.post('/orders/create/adhoc', payload);

      if (response.data.status_code === 200 || response.data.status_code === 1) {
        return {
          success: true,
          orderId: response.data.order_id,
          shipmentId: response.data.shipment_id,
          status: response.data.status,
          message: response.data.status_code === 200 ? 'Order created successfully' : response.data.message
        };
      }

      throw new Error(response.data.message || 'Failed to create order');

    } catch (error) {
      console.error('Create Order Error:', error.response?.data || error.message);
      throw new Error(error.response?.data?.message || 'Failed to create order in Shiprocket');
    }
  }

  /**
   * Generate AWB for shipment
   *
   * @param {number} shipmentId - Shiprocket shipment ID
   * @param {number} courierId - Courier company ID
   * @returns {Promise<Object>} AWB details
   */
  async generateAWB(shipmentId, courierId) {
    try {
      const api = await this.getAxiosInstance();

      const response = await api.post('/courier/assign/awb', {
        shipment_id: shipmentId,
        courier_id: courierId
      });

      if (response.data.awb_assign_status === 1 || response.data.response?.data?.awb_assign_status === 1) {
        const data = response.data.response?.data || response.data;
        return {
          success: true,
          awbCode: data.awb_code,
          courierName: data.courier_name,
          courierCompanyId: data.courier_company_id
        };
      }

      throw new Error('Failed to generate AWB');

    } catch (error) {
      console.error('Generate AWB Error:', error.response?.data || error.message);
      throw new Error('Failed to generate AWB code');
    }
  }

  /**
   * Request pickup for shipment
   *
   * @param {number} shipmentId - Shiprocket shipment ID
   * @returns {Promise<Object>} Pickup details
   */
  async requestPickup(shipmentId) {
    try {
      const api = await this.getAxiosInstance();

      const response = await api.post('/courier/generate/pickup', {
        shipment_id: [shipmentId]
      });

      return {
        success: true,
        pickupStatus: response.data.pickup_status,
        pickupScheduledDate: response.data.pickup_scheduled_date,
        message: 'Pickup requested successfully'
      };

    } catch (error) {
      console.error('Request Pickup Error:', error.response?.data || error.message);
      throw new Error('Failed to request pickup');
    }
  }

  /**
   * Track shipment
   *
   * @param {number} shipmentId - Shiprocket shipment ID
   * @returns {Promise<Object>} Tracking details
   */
  async trackShipment(shipmentId) {
    try {
      const api = await this.getAxiosInstance();

      const response = await api.get(`/courier/track/shipment/${shipmentId}`);

      if (response.data.tracking_data) {
        const tracking = response.data.tracking_data;
        return {
          success: true,
          awbCode: tracking.awb_code,
          courierName: tracking.courier_name,
          currentStatus: tracking.shipment_status,
          trackingUrl: tracking.track_url,
          estimatedDeliveryDate: tracking.edd,
          shipmentTrack: tracking.shipment_track || [],
          shipmentTrackActivities: tracking.shipment_track_activities || [],
          qcResponse: tracking.qc_response
        };
      }

      return {
        success: false,
        message: 'Tracking data not available'
      };

    } catch (error) {
      console.error('Track Shipment Error:', error.response?.data || error.message);
      throw new Error('Failed to track shipment');
    }
  }

  /**
   * Get all available couriers for a shipment
   *
   * @param {number} shipmentId - Shiprocket shipment ID
   * @returns {Promise<Array>} Available couriers
   */
  async getAvailableCouriers(shipmentId) {
    try {
      const api = await this.getAxiosInstance();

      const response = await api.get(`/courier/courierListWithCounts/${shipmentId}`);

      if (response.data.data?.available_couriers_list) {
        return response.data.data.available_couriers_list.map(courier => ({
          id: courier.courier_company_id,
          name: courier.courier_name,
          rate: parseFloat(courier.rate),
          etd: courier.etd,
          suppressed: courier.suppressed
        }));
      }

      return [];

    } catch (error) {
      console.error('Get Available Couriers Error:', error.response?.data || error.message);
      return [];
    }
  }

  /**
   * Cancel shipment
   *
   * @param {Array<number>} shipmentIds - Array of shipment IDs to cancel
   * @returns {Promise<Object>} Cancellation status
   */
  async cancelShipment(shipmentIds) {
    try {
      const api = await this.getAxiosInstance();

      const response = await api.post('/orders/cancel/shipment/awbs', {
        awbs: shipmentIds
      });

      return {
        success: true,
        message: 'Shipment cancelled successfully',
        response: response.data
      };

    } catch (error) {
      console.error('Cancel Shipment Error:', error.response?.data || error.message);
      throw new Error('Failed to cancel shipment');
    }
  }
}

// Singleton instance
const shiprocketClient = new ShiprocketClient();

module.exports = shiprocketClient;
