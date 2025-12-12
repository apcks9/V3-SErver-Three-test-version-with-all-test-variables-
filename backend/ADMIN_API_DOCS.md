# Admin API Documentation

## Authentication

All admin endpoints require authentication using an API key.

**Header:**
```
x-admin-api-key: your_admin_api_key_here
```

Or using Bearer token:
```
Authorization: Bearer your_admin_api_key_here
```

The admin API key is configured in `.env` as `ADMIN_API_KEY`.

---

## Dashboard Endpoints

### Get Dashboard Statistics
Get overview statistics for admin dashboard.

**Endpoint:** `GET /api/admin/dashboard/stats`

**Response:**
```json
{
  "success": true,
  "data": {
    "totalUsers": 150,
    "activeSubscriptions": 45,
    "recentUsers": 12,
    "usersByStatus": {
      "free_trial": 80,
      "active": 40,
      "lifetime": 5,
      "canceled": 25
    },
    "revenue": {
      "total": 450000,
      "totalTransactions": 50,
      "byPlan": [
        {
          "_id": "subscription",
          "revenue": 80000,
          "count": 40
        },
        {
          "_id": "one_time",
          "revenue": 100000,
          "count": 5
        }
      ]
    }
  }
}
```

### Get Revenue Statistics
Get revenue data for a specific period.

**Endpoint:** `GET /api/admin/dashboard/revenue?period=30d`

**Query Parameters:**
- `period` (optional): `7d`, `30d`, `90d`, `1y` (default: `30d`)

**Response:**
```json
{
  "success": true,
  "data": {
    "period": "30d",
    "totalRevenue": 450000,
    "totalTransactions": 50,
    "averageTransaction": 9000,
    "dailyRevenue": [
      {
        "_id": "2025-11-01",
        "revenue": 20000,
        "count": 2
      }
    ]
  }
}
```

---

## User Management Endpoints

### Get All Users (Paginated)
Retrieve all users with pagination, filtering, and sorting.

**Endpoint:** `GET /api/admin/users`

**Query Parameters:**
- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page (default: 20)
- `sortBy` (optional): Sort field (default: `createdAt`)
- `sortOrder` (optional): `asc` or `desc` (default: `desc`)
- `status` (optional): Filter by subscription status
- `plan` (optional): Filter by subscription plan
- `search` (optional): Search by email or name

**Example:**
```
GET /api/admin/users?page=1&limit=20&status=active&search=john
```

**Response:**
```json
{
  "success": true,
  "data": {
    "users": [
      {
        "_id": "user123",
        "name": "John Doe",
        "email": "john@example.com",
        "subscriptionStatus": "active",
        "subscriptionPlan": "monthly",
        "queriesUsed": 25,
        "queriesLimit": 5,
        "remainingQueries": "Unlimited",
        "createdAt": "2025-11-01T10:00:00.000Z",
        "updatedAt": "2025-11-21T10:00:00.000Z"
      }
    ],
    "pagination": {
      "currentPage": 1,
      "totalPages": 5,
      "totalUsers": 100,
      "perPage": 20,
      "hasNext": true,
      "hasPrev": false
    }
  }
}
```

### Get User by ID
Retrieve detailed information about a specific user.

**Endpoint:** `GET /api/admin/users/:userId`

**Response:**
```json
{
  "success": true,
  "data": {
    "user": {
      "_id": "user123",
      "name": "John Doe",
      "email": "john@example.com",
      "subscriptionStatus": "active",
      "subscriptionPlan": "monthly",
      "stripeCustomerId": "cus_xyz",
      "stripeSubscriptionId": "sub_xyz",
      "queriesUsed": 0,
      "queriesLimit": 5,
      "remainingQueries": "Unlimited",
      "createdAt": "2025-11-01T10:00:00.000Z"
    },
    "recentPayments": [
      {
        "_id": "pay123",
        "amount": 200,
        "status": "succeeded",
        "paymentType": "subscription",
        "createdAt": "2025-11-01T10:00:00.000Z"
      }
    ]
  }
}
```

### Update User Subscription
Update a user's subscription status or plan.

**Endpoint:** `PUT /api/admin/users/:userId/subscription`

**Request Body:**
```json
{
  "subscriptionStatus": "active",
  "subscriptionPlan": "monthly"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "user": { /* updated user object */ },
    "message": "User subscription updated successfully"
  }
}
```

### Reset User Trial
Reset a user's free trial (queries and lockout).

**Endpoint:** `POST /api/admin/users/:userId/reset-trial`

**Response:**
```json
{
  "success": true,
  "data": {
    "user": { /* updated user object */ },
    "message": "User trial reset successfully"
  }
}
```

### Delete User
Delete a user and all associated payments.

**Endpoint:** `DELETE /api/admin/users/:userId`

**Response:**
```json
{
  "success": true,
  "data": {
    "message": "User and associated payments deleted successfully"
  }
}
```

### Search Users
Quick search for users by email or name.

**Endpoint:** `GET /api/admin/users/search?q=john`

**Query Parameters:**
- `q` (required): Search query

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "_id": "user123",
      "name": "John Doe",
      "email": "john@example.com",
      "subscriptionStatus": "active",
      "subscriptionPlan": "monthly",
      "queriesUsed": 0
    }
  ]
}
```

---

## Payment Management Endpoints

### Get All Payments (Paginated)
Retrieve all payments with pagination and filtering.

**Endpoint:** `GET /api/admin/payments`

**Query Parameters:**
- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page (default: 20)
- `sortBy` (optional): Sort field (default: `createdAt`)
- `sortOrder` (optional): `asc` or `desc` (default: `desc`)
- `status` (optional): Filter by payment status (`pending`, `succeeded`, `failed`, `refunded`)
- `paymentType` (optional): Filter by payment type (`subscription`, `one_time`)
- `userId` (optional): Filter by user ID

**Example:**
```
GET /api/admin/payments?page=1&limit=20&status=succeeded&paymentType=subscription
```

**Response:**
```json
{
  "success": true,
  "data": {
    "payments": [
      {
        "_id": "pay123",
        "userId": {
          "_id": "user123",
          "name": "John Doe",
          "email": "john@example.com",
          "subscriptionStatus": "active"
        },
        "amount": 200,
        "currency": "usd",
        "status": "succeeded",
        "paymentType": "subscription",
        "subscriptionPlan": "monthly",
        "stripePaymentIntentId": "pi_xyz",
        "createdAt": "2025-11-01T10:00:00.000Z"
      }
    ],
    "pagination": {
      "currentPage": 1,
      "totalPages": 3,
      "totalPayments": 50,
      "perPage": 20,
      "hasNext": true,
      "hasPrev": false
    }
  }
}
```

### Get Payment by ID
Retrieve detailed information about a specific payment.

**Endpoint:** `GET /api/admin/payments/:paymentId`

**Response:**
```json
{
  "success": true,
  "data": {
    "_id": "pay123",
    "userId": {
      "_id": "user123",
      "name": "John Doe",
      "email": "john@example.com",
      "subscriptionStatus": "active",
      "subscriptionPlan": "monthly"
    },
    "amount": 200,
    "currency": "usd",
    "status": "succeeded",
    "paymentType": "subscription",
    "subscriptionPlan": "monthly",
    "stripePaymentIntentId": "pi_xyz",
    "stripeInvoiceId": "in_xyz",
    "metadata": {},
    "createdAt": "2025-11-01T10:00:00.000Z",
    "updatedAt": "2025-11-01T10:00:00.000Z"
  }
}
```

---

## Example Usage

### Using cURL

```bash
# Get dashboard stats
curl -X GET http://localhost:3000/api/admin/dashboard/stats \
  -H "x-admin-api-key: admin_dev_key_12345_change_in_production"

# Get users with pagination
curl -X GET "http://localhost:3000/api/admin/users?page=1&limit=10&status=active" \
  -H "x-admin-api-key: admin_dev_key_12345_change_in_production"

# Search users
curl -X GET "http://localhost:3000/api/admin/users/search?q=john" \
  -H "x-admin-api-key: admin_dev_key_12345_change_in_production"

# Update user subscription
curl -X PUT http://localhost:3000/api/admin/users/user123/subscription \
  -H "x-admin-api-key: admin_dev_key_12345_change_in_production" \
  -H "Content-Type: application/json" \
  -d '{"subscriptionStatus": "active", "subscriptionPlan": "monthly"}'

# Reset user trial
curl -X POST http://localhost:3000/api/admin/users/user123/reset-trial \
  -H "x-admin-api-key: admin_dev_key_12345_change_in_production"

# Get payments
curl -X GET "http://localhost:3000/api/admin/payments?page=1&limit=20" \
  -H "x-admin-api-key: admin_dev_key_12345_change_in_production"
```

### Using JavaScript/Fetch

```javascript
const adminApiKey = 'admin_dev_key_12345_change_in_production';
const baseURL = 'http://localhost:3000/api/admin';

// Get dashboard stats
async function getDashboardStats() {
  const response = await fetch(`${baseURL}/dashboard/stats`, {
    headers: {
      'x-admin-api-key': adminApiKey
    }
  });
  const data = await response.json();
  console.log(data);
}

// Get users with pagination
async function getUsers(page = 1, limit = 20) {
  const response = await fetch(`${baseURL}/users?page=${page}&limit=${limit}`, {
    headers: {
      'x-admin-api-key': adminApiKey
    }
  });
  const data = await response.json();
  console.log(data);
}

// Update user subscription
async function updateUserSubscription(userId, subscriptionData) {
  const response = await fetch(`${baseURL}/users/${userId}/subscription`, {
    method: 'PUT',
    headers: {
      'x-admin-api-key': adminApiKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(subscriptionData)
  });
  const data = await response.json();
  console.log(data);
}
```

---

## Error Responses

### 401 Unauthorized
```json
{
  "success": false,
  "error": "Admin authentication required. Please provide x-admin-api-key header."
}
```

### 403 Forbidden
```json
{
  "success": false,
  "error": "Invalid admin API key"
}
```

### 404 Not Found
```json
{
  "success": false,
  "error": "User not found"
}
```

### 500 Server Error
```json
{
  "success": false,
  "error": "Internal server error message"
}
```

---

## Security Notes

1. **API Key Storage**: Store the `ADMIN_API_KEY` securely in environment variables
2. **HTTPS**: Always use HTTPS in production
3. **Rate Limiting**: Admin endpoints are subject to rate limiting (100 requests per 15 minutes)
4. **Access Control**: Consider implementing role-based access control for production
5. **Audit Logging**: Consider adding audit logs for admin actions

---

## Pagination Best Practices

- Default page size is 20 items
- Maximum page size is 100 items
- Use `hasNext` and `hasPrev` flags for navigation
- Total counts are provided for UI pagination controls

---

## Future Enhancements

- JWT-based authentication with refresh tokens
- Role-based access control (super admin, admin, moderator)
- Audit logging for all admin actions
- Export data to CSV/Excel
- Bulk operations (bulk update, bulk delete)
- Advanced filtering and search
- Real-time dashboard with WebSockets
