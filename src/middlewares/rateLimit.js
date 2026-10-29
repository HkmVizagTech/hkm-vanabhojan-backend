const rateLimit = require('express-rate-limit');
const { isTest } = require('../config/env');

const make = (windowMs, limit, message) =>
  rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skip: () => isTest,
    message: { status: 'error', message },
  });

module.exports = {
  // Brute-force protection on credentials.
  authLimiter: make(15 * 60 * 1000, 20, 'Too many attempts, please try again later'),
  // Public endpoints that hit Razorpay / the database per request.
  publicLimiter: make(60 * 1000, 40, 'Too many requests, please slow down'),
};
