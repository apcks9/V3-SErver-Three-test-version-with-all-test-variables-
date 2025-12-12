# Payment Tracking API Endpoints

## Quick Reference

### Admin Transaction Endpoints

All admin endpoints require authentication header:
```
x-admin-api-key: your_admin_api_key
```

---

## 1. Get All Payment Transactions

**Endpoint**: `GET /api/admin/transactions`

**Description**: Retrieve all payment transactions with comprehensive filtering and pagination

**Query Parameters**:
| Parameter | Type | Required | Description | Example |
|-----------|------|----------|-------------|---------|
| page | Number | No | Page number (default: 1) | `page=2` |
| limit | Number | No | Items per page (default: 50) | `limit=100` |
| status | String | No | Filter by payment status | `status=succeeded` |
| plan | String | No | Filter by subscription plan | `plan=lifetime` |
| email | String | No | Filter by user email | `email=user@example.com` |
| startDate | String | No | Filter from date (ISO 8601) | `startDate=2025-01-01` |
| endDate | String | No | Filter to date (ISO 8601) | `endDate=2025-12-31` |

**Example Request**:
```bash
curl -X GET "http://localhost:3000/api/admin/transactions?page=1&limit=50&status=succeeded&plan=lifetime" \
  -H "x-admin-api-key: admin_dev_key_12345_change_in_production"
```

**Example Response**:
```json
{
  "success": true,
  "data": {
    "payments": [
      {
        "_id": "674567890abcdef123456789",
        "email": "john@example.com",
        "userName": "John Doe",
        "subscriptionPlan": "lifetime",
        "amount": 29900,
        "currency": "usd",
        "status": "succeeded",
        "isSuccessful": true,
        "purchaseDate": "2025-11-26T14:30:00.000Z",
        "registrationKey": "LT-3A5B7C9D-1E2F4A6B",
        "hasRegistrationKey": true,
        "registrationKeySent": false,
        "registrationKeySentAt": null,
        "paymentType": "one_time",
        "stripePaymentIntentId": "pi_xxxxxxxxxxxxx",
        "metadata": {}
      }
    ],
    "pagination": {
      "currentPage": 1,
      "totalPages": 5,
      "totalPayments": 243,
      "perPage": 50,
      "hasNext": true,
      "hasPrev": false
    }
  }
}
```

**Response Fields**:
- `email`: User's email address
- `userName`: User's full name
- `subscriptionPlan`: Plan type (monthly/yearly/lifetime)
- `amount`: Amount in cents (29900 = $299.00)
- `currency`: Currency code (usd, eur, etc.)
- `status`: Payment status (succeeded, failed, pending, refunded)
- `isSuccessful`: Boolean indicating if payment succeeded
- `purchaseDate`: ISO 8601 timestamp of purchase
- `registrationKey`: Auto-generated key (lifetime purchases only)
- `hasRegistrationKey`: Boolean indicating if key exists
- `registrationKeySent`: Boolean indicating if key was sent
- `registrationKeySentAt`: Timestamp when key was sent

---

## 2. Get Payment Statistics

**Endpoint**: `GET /api/admin/transactions/stats`

**Description**: Get comprehensive payment and revenue statistics

**Example Request**:
```bash
curl -X GET "http://localhost:3000/api/admin/transactions/stats" \
  -H "x-admin-api-key: admin_dev_key_12345_change_in_production"
```

**Example Response**:
```json
{
  "success": true,
  "data": {
    "totalSuccessful": 243,
    "totalFailed": 12,
    "totalRevenue": 24567800,
    "totalTransactions": 255,
    "revenueByPlan": {
      "monthly": {
        "revenue": 494000,
        "count": 50
      },
      "yearly": {
        "revenue": 989000,
        "count": 10
      },
      "lifetime": {
        "revenue": 23084800,
        "count": 183
      }
    },
    "lifetime": {
      "totalPurchases": 183,
      "keysGenerated": 183,
      "keysSent": 150,
      "keysPending": 33
    },
    "recentTransactions": 15,
    "monthlySubscribers": 50
  }
}
```

**Response Fields**:
- `totalSuccessful`: Count of successful payments
- `totalFailed`: Count of failed payments
- `totalRevenue`: Total revenue in cents
- `totalTransactions`: Total number of transactions
- `revenueByPlan`: Revenue breakdown by subscription plan
- `lifetime.totalPurchases`: Total lifetime purchases
- `lifetime.keysGenerated`: Registration keys generated
- `lifetime.keysSent`: Keys sent to users
- `lifetime.keysPending`: Keys not yet sent
- `recentTransactions`: Transactions in last 24 hours
- `monthlySubscribers`: Active monthly subscribers

---

## 3. Mark Registration Key as Sent

**Endpoint**: `POST /api/admin/transactions/:paymentId/mark-key-sent`

**Description**: Mark a registration key as sent to the user

**URL Parameters**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| paymentId | String | Yes | MongoDB ObjectId of the payment |

**Example Request**:
```bash
curl -X POST "http://localhost:3000/api/admin/transactions/674567890abcdef123456789/mark-key-sent" \
  -H "x-admin-api-key: admin_dev_key_12345_change_in_production"
```

**Example Response**:
```json
{
  "success": true,
  "data": {
    "message": "Registration key marked as sent",
    "payment": {
      "_id": "674567890abcdef123456789",
      "userEmail": "john@example.com",
      "registrationKey": "LT-3A5B7C9D-1E2F4A6B",
      "registrationKeySent": true,
      "registrationKeySentAt": "2025-11-26T15:00:00.000Z"
    }
  }
}
```

---

## Common Status Codes

| Code | Meaning | Description |
|------|---------|-------------|
| 200 | Success | Request completed successfully |
| 400 | Bad Request | Invalid parameters or missing data |
| 401 | Unauthorized | Invalid or missing API key |
| 404 | Not Found | Resource not found |
| 500 | Server Error | Internal server error |

---

## Filtering Examples

### Get all successful lifetime purchases
```bash
GET /api/admin/transactions?status=succeeded&plan=lifetime
```

### Get transactions for a specific email
```bash
GET /api/admin/transactions?email=john@example.com
```

### Get transactions from last 30 days
```bash
GET /api/admin/transactions?startDate=2025-10-27&endDate=2025-11-26
```

### Get only failed payments
```bash
GET /api/admin/transactions?status=failed
```

### Get lifetime purchases with pending registration keys
```bash
GET /api/admin/transactions?plan=lifetime
# Then filter in code where registrationKeySent === false
```

---

## Registration Key Management Workflow

1. **Payment Completed**: System auto-generates registration key for lifetime purchases
2. **Admin Views Transactions**: See all keys with "Not sent" status
3. **Admin Sends Email**: Manually email registration key to user
4. **Admin Marks as Sent**: Click "Mark Sent" or call API endpoint
5. **System Updates**: Sets `registrationKeySent = true` and `registrationKeySentAt = current timestamp`

---

## Rate Limiting

Admin endpoints are protected by rate limiting:
- **100 requests per 15 minutes** per IP address

---

## Notes

- All monetary amounts are in cents (divide by 100 for dollars)
- All dates are in ISO 8601 format
- Registration keys are only generated for successful lifetime purchases
- Pagination is recommended for large datasets
- Use filtering to reduce response size and improve performance

---

## Testing in Development

**Default Admin API Key** (Change in production!):
```
admin_dev_key_12345_change_in_production
```

**Base URL**:
```
http://localhost:3000/api/admin
```
