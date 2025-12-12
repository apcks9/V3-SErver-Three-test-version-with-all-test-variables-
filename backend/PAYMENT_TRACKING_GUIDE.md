# Payment Tracking System - Complete Guide

## Overview

This comprehensive payment tracking system monitors all subscription purchases, stores detailed transaction data, and manages registration keys for lifetime purchases. Every payment is tracked with user email, subscription plan, success status, timestamp, and registration key information.

## Features

- ✅ **Complete Payment Tracking**: Every payment is recorded with full details
- 📧 **User Email Tracking**: Each transaction stores the user's email address
- 📅 **Timestamp Recording**: Exact date and time of each purchase
- 🔑 **Registration Key Management**: Auto-generated keys for lifetime purchases
- 📊 **Admin Dashboard**: Visual interface to view and manage all transactions
- 📈 **Payment Statistics**: Real-time analytics on revenue, subscriptions, and keys

## Database Schema

### Payment Model

Each payment transaction includes:

```javascript
{
  userId: ObjectId,                    // Reference to User
  userEmail: String,                   // User's email address
  stripePaymentIntentId: String,       // Stripe payment intent ID
  stripeInvoiceId: String,             // Stripe invoice ID (for subscriptions)
  amount: Number,                      // Amount in cents (e.g., 9900 = $99.00)
  currency: String,                    // Currency code (default: 'usd')
  status: String,                      // 'succeeded', 'failed', 'pending', 'refunded'
  paymentType: String,                 // 'subscription' or 'one_time'
  subscriptionPlan: String,            // 'monthly', 'yearly', 'lifetime', or null
  registrationKey: String,             // Auto-generated for lifetime purchases
  registrationKeySent: Boolean,        // Whether key has been sent to user
  registrationKeySentAt: Date,         // When the key was sent
  purchaseDate: Date,                  // When the purchase was made
  metadata: Object,                    // Additional metadata
  createdAt: Date,                     // Record creation timestamp
  updatedAt: Date                      // Last update timestamp
}
```

### Registration Key Format

Lifetime purchases automatically generate registration keys in this format:
```
LT-XXXXXXXX-XXXXXXXX
```
Example: `LT-A3F5B2C1-9D7E4F6A`

## API Endpoints

### Payment Tracking Endpoints

#### 1. Get All Payment Transactions
```http
GET /api/admin/transactions?page=1&limit=50
```

**Query Parameters:**
- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page (default: 50)
- `status` (optional): Filter by status ('succeeded', 'failed', 'pending')
- `plan` (optional): Filter by plan ('monthly', 'yearly', 'lifetime')
- `email` (optional): Filter by user email
- `startDate` (optional): Filter by start date (ISO 8601)
- `endDate` (optional): Filter by end date (ISO 8601)

**Response:**
```json
{
  "success": true,
  "data": {
    "payments": [
      {
        "_id": "...",
        "email": "user@example.com",
        "userName": "John Doe",
        "subscriptionPlan": "lifetime",
        "amount": 29900,
        "currency": "usd",
        "status": "succeeded",
        "isSuccessful": true,
        "purchaseDate": "2025-11-26T10:30:00.000Z",
        "registrationKey": "LT-A3F5B2C1-9D7E4F6A",
        "hasRegistrationKey": true,
        "registrationKeySent": false,
        "registrationKeySentAt": null,
        "paymentType": "one_time"
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

#### 2. Get Payment Statistics
```http
GET /api/admin/transactions/stats
```

**Response:**
```json
{
  "success": true,
  "data": {
    "totalSuccessful": 243,
    "totalFailed": 12,
    "totalRevenue": 24567800,
    "totalTransactions": 255,
    "revenueByPlan": {
      "monthly": { "revenue": 494000, "count": 50 },
      "yearly": { "revenue": 989000, "count": 10 },
      "lifetime": { "revenue": 23084800, "count": 183 }
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

#### 3. Mark Registration Key as Sent
```http
POST /api/admin/transactions/:paymentId/mark-key-sent
```

**Response:**
```json
{
  "success": true,
  "data": {
    "message": "Registration key marked as sent",
    "payment": {
      "_id": "...",
      "userEmail": "user@example.com",
      "registrationKey": "LT-A3F5B2C1-9D7E4F6A",
      "registrationKeySent": true,
      "registrationKeySentAt": "2025-11-26T11:00:00.000Z"
    }
  }
}
```

## Admin Dashboard

### Accessing the Dashboard

1. Navigate to the admin dashboard (typically `/admin-dashboard`)
2. Use your admin API key for authentication
3. Click on the "Transactions" menu item

### Dashboard Features

#### Transaction View

The Transactions page displays:

1. **Statistics Overview**
   - Total Revenue
   - Successful Payments
   - Failed Payments
   - Recent Transactions (24h)

2. **Lifetime Registration Keys Section**
   - Total Lifetime Purchases
   - Keys Generated
   - Keys Sent
   - Keys Pending

3. **Transactions Table** with columns:
   - Email
   - Plan (Monthly, Yearly, Lifetime)
   - Amount
   - Status (Success/Failed)
   - Date & Time
   - Registration Key (for lifetime purchases)
   - Actions (Mark Key Sent button)

#### Filtering and Pagination

- **Pagination**: Navigate through pages of transactions
- **Sorting**: Click column headers to sort
- **Filtering**: Use query parameters to filter by status, plan, email, or date range

## How Payment Tracking Works

### 1. User Makes a Purchase

When a user completes a payment on the frontend:
```javascript
// Frontend (subscription-manager.js)
async handlePayment(name, email, plan) {
  // Create user in backend
  const response = await fetch(`${apiBaseUrl}/payments/users`, {
    method: 'POST',
    body: JSON.stringify({ name, email })
  });

  // Redirect to Stripe checkout
  window.open(stripeCheckoutUrl);
}
```

### 2. Stripe Webhook Captures Payment

When payment succeeds, Stripe sends a webhook:
```javascript
// Backend (webhookController.js)
async function handleCheckoutSessionCompleted(session) {
  // Update user subscription status
  user.subscriptionStatus = plan;
  await user.save();

  // Create payment record with registration key
  const payment = await Payment.create({
    userId: user._id,
    userEmail: user.email,
    amount: session.amount_total,
    status: 'succeeded',
    subscriptionPlan: plan,
    purchaseDate: new Date()
  });

  // Registration key auto-generated for lifetime purchases
  if (plan === 'lifetime') {
    console.log('🔑 Registration key:', payment.registrationKey);
  }
}
```

### 3. Admin Views Transaction

Admin can view all transactions in the dashboard:
```javascript
// Admin Dashboard (main.js)
async function TransactionsPage() {
  const response = await api.getPaymentTransactions({ page, limit: 50 });

  // Display all transaction details including:
  // - User email
  // - Subscription plan
  // - Amount paid
  // - Success/failure status
  // - Timestamp
  // - Registration key (if lifetime)
  // - Key sent status
}
```

### 4. Admin Marks Key as Sent

When admin sends registration key to user:
```javascript
// Admin clicks "Mark Sent" button
window.markKeySent = async (paymentId) => {
  await api.markKeySent(paymentId);
  // Updates registrationKeySent = true
  // Sets registrationKeySentAt = current timestamp
}
```

## Data Captured for Each Payment

### Required Data
- ✅ User's email address
- ✅ Subscription plan purchased (monthly/yearly/lifetime)
- ✅ Payment success status
- ✅ Date and time of purchase

### Additional Tracked Data
- ✅ User ID and name
- ✅ Payment amount and currency
- ✅ Stripe payment intent ID
- ✅ Registration key (for lifetime purchases)
- ✅ Registration key sent status
- ✅ Payment type (subscription vs one-time)
- ✅ Stripe customer and session IDs

## Registration Key Management

### Auto-Generation

Registration keys are automatically generated when:
- Subscription plan is "lifetime"
- Payment status is "succeeded"
- No existing registration key

### Key Format

Keys use the format: `LT-{UUID1}-{UUID2}`
- `LT` = Lifetime prefix
- Two 8-character UUID segments
- Always uppercase
- Example: `LT-3A5B7C9D-1E2F4A6B`

### Tracking Key Delivery

Use the "Mark Sent" feature to track:
1. Which keys have been sent to users
2. When each key was sent
3. Which keys are still pending

## Testing the System

### 1. Test Payment Creation

```bash
# Start the backend server
cd backend
npm run dev

# The server should show:
# ✅ Payment record created
# 🔑 Registration key generated: LT-XXXXXXXX-XXXXXXXX
```

### 2. View Transactions

```bash
# Test the transactions endpoint
curl -X GET "http://localhost:3000/api/admin/transactions?limit=10" \
  -H "x-admin-api-key: your_admin_key"
```

### 3. Check Payment Stats

```bash
# Get statistics
curl -X GET "http://localhost:3000/api/admin/transactions/stats" \
  -H "x-admin-api-key: your_admin_key"
```

## Configuration

### Environment Variables

Ensure these are set in `.env`:
```env
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
MONGODB_URI=mongodb://localhost:27017/multiai
ADMIN_API_KEY=your_secure_admin_key
```

### Admin Authentication

Admin endpoints require the `x-admin-api-key` header:
```javascript
headers: {
  'x-admin-api-key': 'your_admin_key'
}
```

## Troubleshooting

### Payment Not Recorded

1. Check webhook is configured in Stripe dashboard
2. Verify `STRIPE_WEBHOOK_SECRET` is correct
3. Check server logs for webhook errors

### Registration Key Not Generated

1. Ensure payment plan is "lifetime"
2. Check payment status is "succeeded"
3. Verify Payment model pre-save hook is working

### Dashboard Not Showing Transactions

1. Check admin API key is correct
2. Verify MongoDB connection
3. Check browser console for API errors

## Next Steps

### Recommended Enhancements

1. **Email Integration**: Automatically send registration keys via email
2. **Export Functionality**: Export transactions to CSV/Excel
3. **Advanced Filtering**: Add date range picker, multi-select filters
4. **Notifications**: Alert admin when new lifetime purchases occur
5. **Key Regeneration**: Allow admin to regenerate keys if needed

## Support

For issues or questions about the payment tracking system:
1. Check server logs for errors
2. Review Stripe dashboard for webhook events
3. Check MongoDB for payment records
4. Review this documentation for troubleshooting steps
