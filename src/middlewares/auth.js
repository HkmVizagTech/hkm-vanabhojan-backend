const jwt = require('jsonwebtoken');
const { env } = require('../config/env');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');

const bearerToken = req => {
  const [scheme, token] = (req.headers.authorization || '').split(' ');
  return scheme === 'Bearer' && token ? token : null;
};

/** Verifies the JWT and loads the user, so a deleted/demoted account loses access immediately. */
async function authenticate(req, _res, next) {
  const token = bearerToken(req);
  if (!token) throw ApiError.unauthorized('Access token required');

  let payload;
  try {
    payload = jwt.verify(token, env.JWT_SECRET);
  } catch {
    throw ApiError.forbidden('Invalid or expired token');
  }

  const user = await User.findById(payload.id);
  if (!user) throw ApiError.unauthorized('User no longer exists');
  if (user.active === false) throw ApiError.forbidden('This account has been disabled');

  req.user = { id: user._id.toString(), email: user.email, role: user.role, name: user.name, isSuperAdmin: Boolean(user.isSuperAdmin), canCollectCash: Boolean(user.canCollectCash) };
  next();
}

/** Like authenticate, but anonymous requests pass through with req.user unset. */
async function authenticateOptional(req, res, next) {
  if (!bearerToken(req)) return next();
  return authenticate(req, res, next);
}

const requireRole =
  (...roles) =>
  (req, _res, next) => {
    if (!req.user) throw ApiError.unauthorized();
    if (!roles.includes(req.user.role)) throw ApiError.forbidden();
    next();
  };

/** Admins always may; volunteers only when an admin granted them the cash permission. */
const requireCashAccess = (req, _res, next) => {
  if (!req.user) throw ApiError.unauthorized();
  if (req.user.role !== 'admin' && !req.user.canCollectCash) throw ApiError.forbidden('You do not have cash desk access');
  next();
};

module.exports = { authenticate, authenticateOptional, requireRole, requireCashAccess };
