const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { env } = require('../config/env');
const { ROLES } = require('../config/constants');
const ApiError = require('../utils/ApiError');

const BCRYPT_ROUNDS = 12;
// Compared against when the email is unknown so response time does not reveal which emails exist.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', BCRYPT_ROUNDS);

const signToken = user => jwt.sign({ id: user.id, role: user.role }, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN });

/**
 * Creates a staff account. The very first account becomes the super admin (bootstrap);
 * afterwards only an authenticated admin may create accounts, and only the super admin may create admins.
 */
async function register({ name, email, password, role, canCollectCash }, actor) {
  const isFirstUser = !(await User.exists({}));
  if (!isFirstUser && actor?.role !== ROLES.ADMIN) throw ApiError.forbidden('Only an admin can create accounts');
  if (!isFirstUser && role === ROLES.ADMIN && !actor.isSuperAdmin) {
    throw ApiError.forbidden('Only the super admin can create admin accounts');
  }

  if (await User.exists({ email })) throw ApiError.conflict('User already exists');

  return User.create({
    name,
    email,
    password: await bcrypt.hash(password, BCRYPT_ROUNDS),
    role: isFirstUser ? ROLES.ADMIN : role || ROLES.USER,
    isSuperAdmin: isFirstUser,
    canCollectCash: Boolean(canCollectCash),
  });
}

async function login({ email, password }) {
  const user = await User.findOne({ email }).select('+password');
  const valid = await bcrypt.compare(password, user ? user.password : DUMMY_HASH);
  if (!user || !valid) throw ApiError.unauthorized('Invalid email or password');
  if (user.active === false) throw ApiError.forbidden('This account has been disabled. Please contact an admin.');
  return { token: signToken(user), user };
}

/** Staff list for the admin console. The super admin never appears in it. */
const listUsers = () => User.find({ isSuperAdmin: { $ne: true } }).sort({ createdAt: -1 });

/**
 * Who may change whom:
 *  - nobody changes their own account here (no locking yourself out),
 *  - the super admin is invisible (404) and untouchable,
 *  - admins manage volunteers only; the super admin manages everyone else.
 */
async function loadManageable(id, actor) {
  const target = await User.findById(id);
  if (!target || target.isSuperAdmin) throw ApiError.notFound('User not found');
  if (target._id.toString() === actor.id) throw ApiError.badRequest('You cannot change your own account');
  if (target.role === ROLES.ADMIN && !actor.isSuperAdmin) throw ApiError.forbidden('Only the super admin can manage admin accounts');
  return target;
}

async function updateUser(id, changes, actor) {
  const target = await loadManageable(id, actor);
  if (changes.role === ROLES.ADMIN && !actor.isSuperAdmin) throw ApiError.forbidden('Only the super admin can make someone an admin');
  target.set(changes);
  await target.save();
  return target;
}

async function deleteUser(id, actor) {
  const target = await loadManageable(id, actor);
  await target.deleteOne();
  return target;
}

module.exports = { register, login, listUsers, updateUser, deleteUser, signToken };
