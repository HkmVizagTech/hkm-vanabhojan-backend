const Razorpay = require('razorpay');
const { env, integrations } = require('./env');
const ApiError = require('../utils/ApiError');

let client = null;

/** Lazily built so the app (and tests) can boot without payment credentials. */
function getRazorpay() {
  if (!integrations.razorpay) throw ApiError.unavailable('Payments are not configured');
  client ||= new Razorpay({ key_id: env.RAZORPAY_KEY_ID, key_secret: env.RAZORPAY_KEY_SECRET });
  return client;
}

module.exports = { getRazorpay };
