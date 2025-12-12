# Multi-AI Browser Backend Server

A Node.js/Express backend server with Stripe payment integration and MongoDB storage for managing subscriptions and payments.

## Features

- 🔐 User management and authentication
- 💳 Stripe recurring subscription integration
- 📊 Payment tracking and history
- 🗄️ MongoDB data persistence with Mongoose
- 🪝 Stripe webhook handling for real-time events
- 🔒 Secure API with rate limiting and CORS
- 📈 Query tracking for free trial users

## Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** (v16 or higher) - [Download](https://nodejs.org/)
- **MongoDB** (v5 or higher) - [Download](https://www.mongodb.com/try/download/community)
  - Or use [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) (free tier available)
- **Stripe Account** - [Sign up](https://stripe.com)

## Installation

### 1. Install Dependencies

```bash
cd backend
npm install
```

### 2. Set Up MongoDB

#### Option A: Local MongoDB

1. Install MongoDB on your system
2. Start MongoDB service:
   ```bash
   # macOS
   brew services start mongodb-community

   # Linux
   sudo systemctl start mongod

   # Windows
   net start MongoDB
   ```

#### Option B: MongoDB Atlas (Cloud)

1. Create a free account at [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
2. Create a new cluster (free tier available)
3. Create a database user
4. Get your connection string (it will look like: `mongodb+srv://username:password@cluster.mongodb.net/`)

### 3. Configure Stripe

1. Log in to your [Stripe Dashboard](https://dashboard.stripe.com)
2. Get your API keys:
   - Go to **Developers** → **API keys**
   - Copy your **Secret key** (starts with `sk_test_`)
   - Copy your **Publishable key** (starts with `pk_test_`)

3. Create subscription products:
   - Go to **Products** → **Add Product**
   - Create a "Monthly Premium" product with recurring billing
   - Create a "Yearly Premium" product with recurring billing
   - Copy the **Price IDs** (start with `price_`)

4. Set up webhook:
   - Go to **Developers** → **Webhooks**
   - Click **Add endpoint**
   - Enter your server URL: `http://your-domain.com/api/webhooks/stripe`
   - Select events to listen for:
     - `checkout.session.completed`
     - `customer.subscription.created`
     - `customer.subscription.updated`
     - `customer.subscription.deleted`
     - `invoice.paid`
     - `invoice.payment_failed`
   - Copy the **Webhook signing secret** (starts with `whsec_`)

### 4. Configure Environment Variables

1. Copy the example env file:
   ```bash
   cp .env.example .env
   ```

2. Edit `.env` and add your credentials:
   ```env
   # MongoDB
   MONGODB_URI=mongodb://localhost:27017/multiai-browser
   # Or for Atlas: mongodb+srv://username:password@cluster.mongodb.net/multiai-browser

   # Stripe
   STRIPE_SECRET_KEY=sk_test_YOUR_SECRET_KEY
   STRIPE_PUBLISHABLE_KEY=pk_test_YOUR_PUBLISHABLE_KEY
   STRIPE_WEBHOOK_SECRET=whsec_YOUR_WEBHOOK_SECRET

   # Stripe Price IDs
   STRIPE_MONTHLY_PRICE_ID=price_YOUR_MONTHLY_PRICE_ID
   STRIPE_YEARLY_PRICE_ID=price_YOUR_YEARLY_PRICE_ID

   # Frontend URL
   FRONTEND_URL=http://localhost:8080
   ```

## Running the Server

### Development Mode (with auto-restart)

```bash
npm run dev
```

### Production Mode

```bash
npm start
```

The server will start on port 3000 (or the PORT specified in .env).

## API Endpoints

### Health Check

```
GET /health
```

Returns server status.

### User Management

#### Create or Get User

```
POST /api/payments/users
Content-Type: application/json

{
  "name": "John Doe",
  "email": "john@example.com"
}
```

Returns user data including subscription status and query limits.

#### Get User Status

```
GET /api/payments/users/:userId
```

Returns current user status, subscription info, and query data.

### Subscription Management

#### Create Checkout Session

```
POST /api/payments/create-checkout-session
Content-Type: application/json

{
  "userId": "user_id_here",
  "plan": "monthly"  // or "yearly"
}
```

Returns Stripe checkout session URL.

#### Cancel Subscription

```
POST /api/payments/cancel-subscription
Content-Type: application/json

{
  "userId": "user_id_here"
}
```

### Query Tracking

#### Increment Query Counter

```
POST /api/payments/increment-query
Content-Type: application/json

{
  "userId": "user_id_here"
}
```

#### Handle Payment Decline

```
POST /api/payments/handle-decline
Content-Type: application/json

{
  "userId": "user_id_here"
}
```

Applies lockout based on decline count.

### Payment History

#### Get Payment History

```
GET /api/payments/payments/:userId
```

Returns user's payment history.

### Webhooks

#### Stripe Webhook

```
POST /api/webhooks/stripe
```

Handles Stripe events (subscription updates, payments, etc.).

## Frontend Integration

### Using the API Client

1. Copy `api-client.js` to your frontend project
2. Import and use:

```javascript
const PaymentAPI = require('./api-client');

// Create or get user
const user = await PaymentAPI.createOrGetUser('John Doe', 'john@example.com');

// Check if user can make queries
const status = await PaymentAPI.getUserStatus(user.userId);
console.log(status.canQuery); // true or false

// Open Stripe checkout
await PaymentAPI.openStripeCheckout(user.userId, 'monthly');

// Increment query counter
await PaymentAPI.incrementQuery(user.userId);
```

### Example Integration with Electron

```javascript
// In your renderer process
const { shell } = require('electron');

// Load user from local storage or create new
let userId = localStorage.getItem('userId');

if (!userId) {
  const user = await PaymentAPI.createOrGetUser('John Doe', 'john@example.com');
  userId = user.userId;
  localStorage.setItem('userId', userId);
}

// Before each query, check if user can query
async function beforeQuery() {
  const status = await PaymentAPI.getUserStatus(userId);

  if (!status.canQuery) {
    // Show payment modal
    showPaymentModal();
    return false;
  }

  // Increment query counter
  await PaymentAPI.incrementQuery(userId);
  return true;
}

// When user clicks "upgrade"
async function handleUpgrade() {
  const session = await PaymentAPI.createCheckoutSession(userId, 'monthly');
  shell.openExternal(session.url);
}
```

## Testing Webhooks Locally

To test Stripe webhooks locally, use the Stripe CLI:

1. Install Stripe CLI: [Instructions](https://stripe.com/docs/stripe-cli)

2. Login:
   ```bash
   stripe login
   ```

3. Forward webhooks to your local server:
   ```bash
   stripe listen --forward-to localhost:3000/api/webhooks/stripe
   ```

4. Copy the webhook signing secret and update `.env`:
   ```env
   STRIPE_WEBHOOK_SECRET=whsec_xxx
   ```

5. Trigger test events:
   ```bash
   stripe trigger checkout.session.completed
   ```

## Database Schema

### User Model

```javascript
{
  name: String,
  email: String (unique),
  stripeCustomerId: String,
  subscriptionStatus: String, // 'free_trial', 'active', 'past_due', 'canceled', 'unpaid'
  stripeSubscriptionId: String,
  queriesUsed: Number,
  queriesLimit: Number,
  lockoutUntil: Date,
  declineCount: Number,
  subscriptionPlan: String, // 'monthly', 'yearly', null
  subscriptionStartDate: Date,
  subscriptionEndDate: Date,
  createdAt: Date,
  updatedAt: Date
}
```

### Payment Model

```javascript
{
  userId: ObjectId (ref: User),
  stripePaymentIntentId: String,
  stripeInvoiceId: String,
  amount: Number,
  currency: String,
  status: String, // 'pending', 'succeeded', 'failed', 'refunded'
  paymentType: String, // 'subscription', 'one_time'
  subscriptionPlan: String,
  metadata: Object,
  createdAt: Date,
  updatedAt: Date
}
```

## Security Best Practices

1. **Never commit `.env` file** - It's already in `.gitignore`
2. **Use environment variables** for all sensitive data
3. **Enable HTTPS** in production
4. **Validate webhook signatures** - Already implemented
5. **Use rate limiting** - Already configured
6. **Sanitize user inputs** - Already using Mongoose validation

## Troubleshooting

### MongoDB Connection Issues

- Ensure MongoDB is running: `mongosh` should connect successfully
- Check firewall settings
- For Atlas, ensure your IP is whitelisted

### Stripe Webhook Not Working

- Verify webhook endpoint URL is correct
- Check webhook signing secret matches `.env`
- Ensure server is publicly accessible (use ngrok for local testing)
- Check Stripe Dashboard → Developers → Webhooks for event logs

### CORS Errors

- Ensure `FRONTEND_URL` in `.env` matches your frontend URL
- Check CORS configuration in `server.js`

## Deployment

### Heroku

1. Create a new Heroku app
2. Add MongoDB addon or use Atlas
3. Set environment variables in Heroku dashboard
4. Deploy:
   ```bash
   git push heroku main
   ```

### DigitalOcean / AWS / VPS

1. Set up Node.js environment
2. Install MongoDB or use Atlas
3. Clone repository and install dependencies
4. Set environment variables
5. Use PM2 for process management:
   ```bash
   npm install -g pm2
   pm2 start src/server.js --name multiai-backend
   ```

## Support

For issues or questions:
- Check the [Stripe Documentation](https://stripe.com/docs)
- Check the [MongoDB Documentation](https://docs.mongodb.com)
- Review server logs for error messages

## License

MIT
