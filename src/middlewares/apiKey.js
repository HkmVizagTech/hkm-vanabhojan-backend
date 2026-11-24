const crypto = require('node:crypto');
const { env } = require('../config/env');
const ApiError = require('../utils/ApiError');

/** Service-to-service auth for /integrations: a shared secret in the "x-api-key" header. */
function requireIntegrationKey(req, _res, next) {
  if (!env.INTEGRATION_API_KEY) throw ApiError.unavailable('The integration API is not configured');
  const given = Buffer.from(String(req.get('x-api-key') || ''));
  const expected = Buffer.from(env.INTEGRATION_API_KEY);
  // Constant-time compare; lengths must match first or timingSafeEqual throws.
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) {
    throw ApiError.unauthorized('Invalid API key');
  }
  next();
}

module.exports = { requireIntegrationKey };
