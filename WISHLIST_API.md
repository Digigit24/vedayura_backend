# Wishlist API Documentation

## Overview
Complete wishlist functionality for the Ayurvedic E-Commerce platform. All endpoints require authentication (Cookie or Bearer Token).

## Base URL
```
http://localhost:5000/api/wishlist
```

---

## Endpoints

### 1. Get User Wishlist

Retrieve the authenticated user's complete wishlist with all products.

**Endpoint:** `GET /api/wishlist`

**Authentication:** Required (Cookie or Bearer Token)

**Request Example:**
```bash
curl -X GET http://localhost:5000/api/wishlist \
  -H "Authorization: Bearer your_jwt_token"
```

**Response Example (200 OK):**
```json
{
  "success": true,
  "wishlist": {
    "id": "wishlist-uuid",
    "items": [
      {
        "id": "item-uuid-1",
        "product": {
          "id": "product-uuid-1",
          "name": "Ashwagandha Powder 100g",
          "discountedPrice": 450,
          "realPrice": 500,
          "stockQuantity": 100,
          "imageUrls": [
            "https://s3.aws.com/bucket/ashwagandha.jpg"
          ],
          "isActive": true
        }
      },
      {
        "id": "item-uuid-2",
        "product": {
          "id": "product-uuid-2",
          "name": "Triphala Churna 200g",
          "discountedPrice": 300,
          "realPrice": 350,
          "stockQuantity": 50,
          "imageUrls": [
            "https://s3.aws.com/bucket/triphala.jpg"
          ],
          "isActive": true
        }
      }
    ],
    "totalItems": 2
  }
}
```

**Notes:**
- If the user doesn't have a wishlist, one will be automatically created
- Returns empty items array if wishlist is empty
- Only active products are shown

---

### 2. Add Product to Wishlist

Add a product to the user's wishlist.

**Endpoint:** `POST /api/wishlist/add`

**Authentication:** Required (Cookie or Bearer Token)

**Request Headers:**
```
Content-Type: application/json
Authorization: Bearer your_jwt_token
```

**Request Body:**
```json
{
  "productId": "product-uuid"
}
```

**Request Example:**
```bash
curl -X POST http://localhost:5000/api/wishlist/add \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your_jwt_token" \
  -d '{
    "productId": "550e8400-e29b-41d4-a716-446655440000"
  }'
```

**Response Example (200 OK):**
```json
{
  "success": true,
  "message": "Product added to wishlist",
  "wishlistItem": {
    "id": "item-uuid",
    "wishlistId": "wishlist-uuid",
    "productId": "product-uuid",
    "createdAt": "2024-01-15T10:30:00.000Z",
    "product": {
      "id": "product-uuid",
      "name": "Brahmi Capsules 60ct",
      "description": "Premium quality Brahmi extract",
      "discountedPrice": 600,
      "realPrice": 700,
      "stockQuantity": 75,
      "imageUrls": [
        "https://s3.aws.com/bucket/brahmi.jpg"
      ],
      "isActive": true
    }
  }
}
```

**Error Responses:**

**400 Bad Request - Missing Product ID:**
```json
{
  "success": false,
  "message": "Product ID is required"
}
```

**400 Bad Request - Already in Wishlist:**
```json
{
  "success": false,
  "message": "Product already in wishlist"
}
```

**404 Not Found - Product Doesn't Exist:**
```json
{
  "success": false,
  "message": "Product not found"
}
```

**401 Unauthorized - No Token:**
```json
{
  "success": false,
  "message": "Authentication required. Please login."
}
```

**Notes:**
- Automatically creates wishlist if user doesn't have one
- Prevents duplicate entries (each product can only be added once)
- Validates product exists before adding
- Returns complete product details in response

---

### 3. Remove Product from Wishlist

Remove a specific item from the user's wishlist.

**Endpoint:** `DELETE /api/wishlist/remove/:itemId`

**Authentication:** Required (Cookie or Bearer Token)

**URL Parameters:**
- `itemId` (string, required) - The wishlist item ID (not product ID)

**Request Example:**
```bash
curl -X DELETE http://localhost:5000/api/wishlist/remove/item-uuid \
  -H "Authorization: Bearer your_jwt_token"
```

**Response Example (200 OK):**
```json
{
  "success": true,
  "message": "Item removed from wishlist"
}
```

**Error Responses:**

**404 Not Found - Item Doesn't Exist:**
```json
{
  "success": false,
  "message": "Wishlist item not found"
}
```

**403 Forbidden - Unauthorized Access:**
```json
{
  "success": false,
  "message": "Unauthorized access"
}
```

**Notes:**
- Verifies the wishlist item belongs to the authenticated user
- Uses wishlist item ID (from GET wishlist response), not product ID
- Permanent deletion (cannot be undone)

---

## Usage Flow

### Typical User Flow:

1. **View Wishlist**
   ```
   GET /api/wishlist
   ```

2. **Add Products**
   ```
   POST /api/wishlist/add
   { "productId": "uuid-1" }

   POST /api/wishlist/add
   { "productId": "uuid-2" }
   ```

3. **View Updated Wishlist**
   ```
   GET /api/wishlist
   ```

4. **Remove Unwanted Items**
   ```
   DELETE /api/wishlist/remove/item-uuid
   ```

5. **Move to Cart** (separate cart API)
   ```
   POST /api/cart/add
   { "productId": "uuid-from-wishlist", "quantity": 2 }

   DELETE /api/wishlist/remove/item-uuid
   ```

---

## Integration with Frontend

### React Example:

```javascript
import axios from 'axios';

const API_BASE = 'http://localhost:5000/api';

// Configure axios with credentials
const api = axios.create({
  baseURL: API_BASE,
  withCredentials: true,  // For cookie authentication
});

// Add Bearer token interceptor
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Get Wishlist
export const getWishlist = async () => {
  const response = await api.get('/wishlist');
  return response.data;
};

// Add to Wishlist
export const addToWishlist = async (productId) => {
  const response = await api.post('/wishlist/add', { productId });
  return response.data;
};

// Remove from Wishlist
export const removeFromWishlist = async (itemId) => {
  const response = await api.delete(`/wishlist/remove/${itemId}`);
  return response.data;
};

// Example Component Usage
const WishlistComponent = () => {
  const [wishlist, setWishlist] = useState(null);

  useEffect(() => {
    loadWishlist();
  }, []);

  const loadWishlist = async () => {
    try {
      const data = await getWishlist();
      setWishlist(data.wishlist);
    } catch (error) {
      console.error('Failed to load wishlist:', error);
    }
  };

  const handleAddToWishlist = async (productId) => {
    try {
      await addToWishlist(productId);
      loadWishlist(); // Refresh
      toast.success('Added to wishlist!');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to add');
    }
  };

  const handleRemove = async (itemId) => {
    try {
      await removeFromWishlist(itemId);
      loadWishlist(); // Refresh
      toast.success('Removed from wishlist');
    } catch (error) {
      toast.error('Failed to remove');
    }
  };

  return (
    <div className="wishlist">
      <h2>My Wishlist ({wishlist?.totalItems || 0})</h2>
      {wishlist?.items.map((item) => (
        <div key={item.id} className="wishlist-item">
          <img src={item.product.imageUrls[0]} alt={item.product.name} />
          <h3>{item.product.name}</h3>
          <p>₹{item.product.discountedPrice}</p>
          <button onClick={() => handleRemove(item.id)}>Remove</button>
        </div>
      ))}
    </div>
  );
};
```

---

## Database Schema

### Wishlist Table
```sql
CREATE TABLE wishlists (
  id UUID PRIMARY KEY,
  user_id UUID UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### Wishlist Items Table
```sql
CREATE TABLE wishlist_items (
  id UUID PRIMARY KEY,
  wishlist_id UUID REFERENCES wishlists(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id),
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(wishlist_id, product_id)
);
```

**Relationships:**
- One User → One Wishlist (1:1)
- One Wishlist → Many Wishlist Items (1:N)
- One Product → Many Wishlist Items (1:N)

**Constraints:**
- User can only have one wishlist
- Each product can only appear once per wishlist (enforced by unique constraint)
- Deleting a user cascades to delete their wishlist
- Deleting a wishlist cascades to delete all wishlist items

---

## Security Features

1. **Authentication Required**: All endpoints require valid JWT token
2. **Authorization Check**: Users can only access/modify their own wishlist
3. **Product Validation**: Verifies product exists before adding
4. **Duplicate Prevention**: Prevents adding same product twice
5. **Ownership Verification**: Ensures user owns wishlist item before deletion

---

## Performance Considerations

- **Auto-Creation**: Wishlist is created automatically on first access (lazy initialization)
- **Efficient Queries**: Uses Prisma's `include` for optimized joins
- **Unique Constraints**: Database-level duplicate prevention
- **Cascade Deletes**: Automatic cleanup when user is deleted

---

## Testing with cURL

### Complete Test Flow:

```bash
# 1. Login to get token
TOKEN=$(curl -s -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"password123"}' \
  | jq -r '.token')

# 2. View wishlist
curl -X GET http://localhost:5000/api/wishlist \
  -H "Authorization: Bearer $TOKEN" | jq

# 3. Add product to wishlist
curl -X POST http://localhost:5000/api/wishlist/add \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"productId":"550e8400-e29b-41d4-a716-446655440000"}' | jq

# 4. View updated wishlist
curl -X GET http://localhost:5000/api/wishlist \
  -H "Authorization: Bearer $TOKEN" | jq

# 5. Remove item from wishlist
ITEM_ID="item-uuid-here"
curl -X DELETE http://localhost:5000/api/wishlist/remove/$ITEM_ID \
  -H "Authorization: Bearer $TOKEN" | jq
```

---

## Summary

The Wishlist API provides complete functionality for users to:
- ✅ View their wishlist with full product details
- ✅ Add products to their wishlist
- ✅ Remove products from their wishlist
- ✅ Automatic wishlist creation on first use
- ✅ Duplicate prevention
- ✅ Full authentication and authorization
- ✅ Product validation
- ✅ Ownership verification

All endpoints are production-ready with proper error handling, validation, and security measures.
