// Utility script to clear Stripe customer IDs from database
// Run this when switching between Stripe accounts to avoid customer ID mismatches

require('dotenv').config();
const mongoose = require('mongoose');

async function clearStripeCustomers() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });

    console.log('Connected to MongoDB');

    // Update all users to clear their Stripe customer IDs
    const result = await mongoose.connection.db.collection('users').updateMany(
      { stripeCustomerId: { $exists: true, $ne: null } },
      { $unset: { stripeCustomerId: "" } }
    );

    console.log(`\n✅ Cleared Stripe customer IDs from ${result.modifiedCount} users`);
    console.log('Users will get new customer IDs on their next payment attempt');

    await mongoose.connection.close();
    console.log('\nDatabase connection closed');
    process.exit(0);

  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

clearStripeCustomers();
