# Ayurvedic E-Commerce Backend API - Complete Documentation

Production-ready REST API for Ayurvedic e-commerce with Express.js, PostgreSQL, Prisma, Shiprocket delivery, and Razorpay payments.

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Setup database
npm run prisma:generate
npm run prisma:migrate

# Seed admin user
npm run prisma:seed

# Start server
npm run dev
```

**Default Admin Credentials:**
- Email: `admin@gmail.com`
- Password: `admin`
- ⚠️ Change password after first login!

---

## 📋 Features

- ✅ Dual-Layer Authentication (Cookie + Bearer Token)
- ✅ Shiprocket Integration (Distance-based shipping, tracking)
- ✅ Razorpay Payments (With double payment prevention)
- ✅ Refund Management (User request → Admin approval → Auto-process)
- ✅ Image Upload to AWS S3
- ✅ Inventory Management
- ✅ Wishlist & Cart
- ✅ Product Reviews
- ✅ Real-time Webhook Updates

---

## 🔧 Environment Setup

Create `.env` file:

```env
# Server
PORT=5000
NODE_ENV=development

# Database
DATABASE_URL="postgresql://user:pass@localhost:5432/ayurvedic_db"

# JWT
JWT_SECRET=your_jwt_secret_minimum_32_characters
JWT_EXPIRES_IN=7d

# AWS S3
AWS_ACCESS_KEY_ID=your_key
AWS_SECRET_ACCESS_KEY=your_secret
AWS_REGION=ap-south-1
AWS_S3_BUCKET_NAME=your-bucket

# Razorpay
RAZORPAY_KEY_ID=rzp_test_xxxxx
RAZORPAY_KEY_SECRET=your_secret
RAZORPAY_WEBHOOK_SECRET=whsec_xxxxx

# Shiprocket
SHIPROCKET_EMAIL=your@email.com
SHIPROCKET_PASSWORD=your_password
SHIPROCKET_PICKUP_PINCODE=400001
SHIPROCKET_WEBHOOK_SECRET=your_secret

# CORS & Cookie
FRONTEND_URL=http://localhost:3000
COOKIE_SECRET=your_cookie_secret
```

---

## 📚 API Endpoints

Base URL: `http://localhost:5000/api`

### 🔐 Authentication

#### Register
```http
POST /auth/register
Content-Type: application/json

{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "SecurePass123",
  "phone": "+91-9876543210"
}
```

#### Login
```http
POST /auth/login

{
  "email": "admin@gmail.com",
  "password": "admin"
}

Response:
{
  "success": true,
  "token": "jwt_token",
  "user": { "id": "uuid", "role": "ADMIN" }
}
```

#### Get Current User
```http
GET /auth/me
Authorization: Bearer <token>
```

---

### 📦 Products (PUBLIC)

#### Get All Products
```http
GET /products?page=1&limit=10&category=uuid&search=ashwagandha

Response:
{
  "success": true,
  "products": [...],
  "pagination": { "total": 50, "page": 1, "totalPages": 5 }
}
```

#### Get Single Product
```http
GET /products/:id

Response:
{
  "product": {
    "id": "uuid",
    "name": "Ashwagandha Powder",
    "realPrice": 500,
    "discountedPrice": 450,
    "stockQuantity": 100,
    "imageUrls": ["..."],
    "averageRating": 4.5,
    "reviews": [...]
  }
}
```

---

### 🏷️ Categories (PUBLIC)

```http
GET /categories
GET /categories/:id
```

---

### 🛒 Cart (Protected)

```http
GET    /cart                    # Get cart
POST   /cart/add                # Add item { productId, quantity }
PUT    /cart/update/:itemId     # Update quantity
DELETE /cart/remove/:itemId     # Remove item
DELETE /cart/clear              # Clear cart
```

---

### ❤️ Wishlist (Protected)

```http
GET    /wishlist                # Get wishlist
POST   /wishlist/add            # Add item { productId }
DELETE /wishlist/remove/:itemId # Remove item
```

---

### 📍 Addresses (Protected)

```http
GET    /users/addresses         # Get all addresses
POST   /users/address           # Add address
PUT    /users/address/:id       # Update address
DELETE /users/address/:id       # Delete address
```

**Add Address Payload:**
```json
{
  "street": "123 MG Road",
  "city": "Pune",
  "state": "Maharashtra",
  "pincode": "411057",
  "country": "India",
  "isDefault": false
}
```

---

### 🚚 Shipping

#### Calculate Shipping Cost
```http
POST /shipping/calculate
Authorization: Bearer <token>

{
  "deliveryPincode": "400001",
  "weightKg": 0.5
}

Response:
{
  "success": true,
  "available": true,
  "shippingCost": 50,
  "estimatedDays": "2-3",
  "courierName": "Delhivery"
}
```

#### Calculate for Cart
```http
POST /shipping/calculate-for-cart

{
  "deliveryPincode": "400001"
}

Response:
{
  "cartWeight": 1.5,
  "shippingCost": 75,
  "courierName": "Blue Dart"
}
```

#### Check Pincode (PUBLIC)
```http
GET /shipping/check-pincode/:pincode

Response:
{
  "available": true,
  "message": "Delivery available"
}
```

---

### 🛍️ Orders (Protected)

#### Checkout
```http
POST /orders/checkout

{
  "addressId": "uuid",
  "idempotencyKey": "optional-unique-key"
}

Response:
{
  "order": {
    "id": "uuid",
    "razorpayOrderId": "order_xyz",
    "subtotal": 1400,
    "shippingCost": 50,
    "totalAmount": 1450,
    "courierName": "Delhivery"
  },
  "razorpayKeyId": "rzp_test_xxxxx"
}
```

**Features:**
- Auto-calculates shipping
- Validates delivery availability
- **Prevents double payment** with idempotency key
- Decrements stock
- Clears cart

#### Verify Payment & Create Shipment
```http
POST /orders/verify-payment

{
  "orderId": "uuid",
  "razorpayPaymentId": "pay_xyz",
  "razorpayOrderId": "order_xyz",
  "razorpaySignature": "signature"
}

Response:
{
  "order": { "status": "PAID" },
  "shipping": {
    "shiprocketOrderId": "12345",
    "awbCode": "AWB123456",
    "courierName": "Blue Dart"
  }
}
```

**Automated Flow:**
1. Verify signature
2. Update order to PAID
3. Create Shiprocket shipment
4. Generate AWB
5. Request pickup

#### Track Order
```http
GET /orders/:id/track

Response:
{
  "tracking": {
    "awbCode": "AWB123456",
    "courierName": "Blue Dart",
    "currentStatus": "IN_TRANSIT",
    "trackingUrl": "https://...",
    "estimatedDeliveryDate": "2024-01-25",
    "shipmentHistory": [
      {
        "status": "Picked Up",
        "timestamp": "2024-01-20T10:30:00Z",
        "location": "Mumbai"
      }
    ]
  }
}
```

#### Get User Orders
```http
GET /orders

Response:
{
  "orders": [
    {
      "id": "uuid",
      "subtotalAmount": 1400,
      "shippingCost": 50,
      "totalAmount": 1450,
      "status": "SHIPPED",
      "orderItems": [...],
      "shippingDetails": {
        "awbCode": "AWB123",
        "courierName": "Blue Dart",
        "currentStatus": "IN_TRANSIT"
      }
    }
  ]
}
```

#### Cancel Order
```http
PUT /orders/:id/cancel

Response:
{
  "message": "Order cancelled. Stock restored."
}
```

**Features:**
- Cancels Shiprocket shipment
- Restores inventory
- Cannot cancel if SHIPPED/DELIVERED

---

### 💰 Refunds

#### User: Request Refund
```http
POST /refunds/request

{
  "orderId": "uuid",
  "reason": "Product damaged",
  "userNote": "Package arrived damaged"
}

Response:
{
  "refund": {
    "id": "uuid",
    "amount": 1450,
    "status": "REQUESTED",
    "requestedAt": "2024-01-22T10:30:00Z"
  },
  "message": "Request submitted. Admin will review shortly."
}
```

#### User: Get My Refunds
```http
GET /refunds/my-requests

Response:
{
  "refunds": [
    {
      "id": "uuid",
      "amount": 1450,
      "reason": "Product damaged",
      "adminNote": "Approved",
      "status": "COMPLETED",
      "order": { "id": "uuid", "totalAmount": 1450 }
    }
  ]
}
```

#### Admin: Get All Refunds
```http
GET /refunds/admin/all?status=REQUESTED&page=1&limit=20
Authorization: Bearer <admin_token>

Response:
{
  "refunds": [
    {
      "id": "uuid",
      "amount": 1450,
      "reason": "Product damaged",
      "userNote": "...",
      "status": "REQUESTED",
      "user": {
        "name": "John Doe",
        "email": "john@example.com"
      },
      "order": {
        "razorpayPaymentId": "pay_xyz"
      }
    }
  ],
  "pagination": { "total": 25, "page": 1 }
}
```

#### Admin: Approve Refund
```http
POST /refunds/admin/:id/approve
Authorization: Bearer <admin_token>

{
  "adminNote": "Approved - shipping damage"
}

Response:
{
  "refund": {
    "status": "PROCESSING",
    "razorpayRefundId": "rfnd_xyz"
  },
  "razorpayRefund": {
    "id": "rfnd_xyz",
    "status": "initiated",
    "amount": 1450
  },
  "message": "Refund approved. Amount credited in 5-7 days."
}
```

**Automated:**
1. Admin approves
2. Razorpay refund API called
3. Amount credited automatically

#### Admin: Reject Refund
```http
POST /refunds/admin/:id/reject

{
  "adminNote": "Product was used. Cannot refund per policy."
}
```

**Note:** Admin note is REQUIRED when rejecting.

---

### ⭐ Reviews

```http
GET  /reviews/product/:productId  # PUBLIC - Get reviews
POST /reviews                     # Create review
PUT  /reviews/:id                 # Update review
DELETE /reviews/:id               # Delete review
```

**Create Review:**
```json
{
  "productId": "uuid",
  "rating": 5,
  "comment": "Excellent product!"
}
```

**Validation:**
- Rating: 1-5
- One review per user per product

---

### 👨‍💼 Admin APIs (ADMIN ONLY)

#### Image Upload
```http
POST /admin/upload
Content-Type: multipart/form-data
Authorization: Bearer <admin_token>

Form Data: image=<file>

Response:
{
  "imageUrl": "https://bucket.s3.amazonaws.com/products/image.jpg"
}
```

**Pipeline:**
1. Multer saves to `/uploads/temp`
2. Upload to S3
3. Delete local file
4. Return S3 URL

#### Multiple Images
```http
POST /admin/upload/multiple
Form Data: images[]=<file1>, images[]=<file2>
```

#### Product Management
```http
POST   /admin/products      # Create
PUT    /admin/products/:id  # Update
DELETE /admin/products/:id  # Delete
```

**Create Product:**
```json
{
  "name": "Ashwagandha Powder",
  "description": "Premium quality",
  "categoryId": "uuid",
  "realPrice": 500,
  "discountedPrice": 450,
  "stockQuantity": 100,
  "imageUrls": ["https://s3.aws.com/img.jpg"]
}
```

#### Category Management
```http
POST   /admin/categories      # Create
PUT    /admin/categories/:id  # Update
DELETE /admin/categories/:id  # Delete
```

#### Order Management
```http
PUT /admin/orders/:id/status

{
  "status": "SHIPPED",
  "trackingId": "TRACK123"
}
```

**Valid Statuses:** PENDING, PAID, SHIPPED, DELIVERED, CANCELLED

---

### 🔔 Webhooks

#### Shiprocket Webhook
```http
POST /webhooks/shiprocket
X-Shiprocket-Signature: <signature>

Payload:
{
  "shipment_id": 12345,
  "awb_code": "AWB123",
  "current_status": "Delivered",
  "courier_name": "Blue Dart",
  "edd": "2024-01-25"
}
```

**Automated Actions:**
- Updates shipping status
- Updates order status
- Maintains status history

#### Razorpay Webhook
```http
POST /webhooks/razorpay
X-Razorpay-Signature: <signature>
```

**Events:**
- `payment.captured` - Payment success
- `refund.processed` - Refund completed

---

## 🔒 Security Features

1. **Authentication:**
   - Dual-layer (Cookie + Bearer)
   - JWT with expiration
   - Bcrypt password hashing

2. **Payment Security:**
   - Idempotency keys (prevent double charges)
   - Signature verification
   - Webhook authentication

3. **Authorization:**
   - Role-based (USER/ADMIN)
   - Resource ownership validation

4. **Validation:**
   - express-validator for inputs
   - Business rule enforcement

---

## 📊 Database Schema

### Key Models

**Users:** id, name, email, password (bcrypt), role (ADMIN/USER), phone

**Products:** id, name, categoryId, realPrice, discountedPrice, stockQuantity, imageUrls[], isActive

**Orders:** id, userId, subtotalAmount, shippingCost, totalAmount, status, shippingAddressSnapshot (JSONB), dimensions, weight

**Payments:** id, orderId, razorpayOrderId, razorpayPaymentId, idempotencyKey (prevents double payment), amount, amountRefunded, status

**ShippingDetails:** id, orderId, shiprocketOrderId, awbCode, courierName, courierPhone, trackingUrl, currentStatus, statusHistory (JSON)

**Refunds:** id, orderId, userId, razorpayRefundId, amount, reason, userNote, adminNote, status

---

## 🔄 Business Logic

### Inventory Management
- Order Creation: Decrements stock
- Order Cancellation: Increments stock
- Cart: Validates stock before adding

### Shipping Cost
- Calculated by distance (pincode)
- Weight-based pricing
- Auto courier selection (cheapest)

### Refund Workflow
1. User submits request
2. Admin approves/rejects
3. If approved → Razorpay API called
4. Auto-processed

### Double Payment Prevention
- Idempotency keys per order
- Same key = returns existing order
- Different key = creates new order

---

## ⚠️ Error Format

```json
{
  "success": false,
  "message": "Human-readable error",
  "error": "Technical details (dev only)"
}
```

**Status Codes:** 200 (Success), 201 (Created), 400 (Bad Request), 401 (Unauthorized), 403 (Forbidden), 404 (Not Found), 500 (Server Error)

---

## 📖 Complete Flow Example

```bash
# 1. Login as admin
POST /auth/login { "email": "admin@gmail.com", "password": "admin" }

# 2. Upload product images
POST /admin/upload (multipart)

# 3. Create product
POST /admin/products { name, price, images, ... }

# 4. User: Browse products
GET /products

# 5. User: Add to cart
POST /cart/add { productId, quantity }

# 6. User: Check shipping
POST /shipping/calculate-for-cart { deliveryPincode }

# 7. User: Checkout (auto-calculates shipping)
POST /orders/checkout { addressId }

# 8. Frontend: Complete Razorpay payment

# 9. User: Verify payment (creates shipment)
POST /orders/verify-payment { orderId, razorpayPaymentId, ... }

# 10. User: Track order
GET /orders/:id/track

# 11. User: Request refund (if needed)
POST /refunds/request { orderId, reason }

# 12. Admin: Approve refund (auto-processes)
POST /refunds/admin/:id/approve { adminNote }
```

---

## 🚀 Deployment

```bash
# Setup
npm install
npm run prisma:migrate
npm run prisma:seed

# Configure webhooks in Shiprocket & Razorpay dashboards

# Start with PM2
pm2 start server.js --name ayurvedic-api
pm2 save
```

---

## ✅ Feature Checklist

- ✅ Authentication (Cookie + Bearer)
- ✅ Product CRUD (Admin)
- ✅ Public product browsing
- ✅ Cart & Wishlist
- ✅ Address management
- ✅ **Shiprocket integration**
- ✅ **Distance-based shipping**
- ✅ **Real-time tracking**
- ✅ **Delivery partner details**
- ✅ Razorpay payments
- ✅ **Double payment prevention**
- ✅ **Refund system (User + Admin)**
- ✅ **Auto refund processing**
- ✅ **Webhook handlers**
- ✅ Image upload (S3)
- ✅ Inventory management
- ✅ Review system

**Production-ready! 🎉**
