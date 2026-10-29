process.env.NODE_ENV = 'test';
process.env.MONGO_URI = 'mongodb://placeholder/test'; // replaced by the in-memory server in tests/helpers.js
process.env.JWT_SECRET = 'test-secret-test-secret-test-secret-123456';
process.env.RAZORPAY_KEY_ID = 'rzp_test_key';
process.env.RAZORPAY_KEY_SECRET = 'rzp_test_secret';
process.env.RAZORPAY_WEBHOOK_SECRET = 'whsec_test';
process.env.ENABLE_PAYMENT_CRON = 'false';
