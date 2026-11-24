const CANDIDATE_TYPES = Object.freeze({ COLLEGE: 'College', WORKING: 'Working' });
const PAYMENT_STATUS = Object.freeze({ PENDING: 'Pending', PAID: 'Paid', FAILED: 'Failed', REFUNDED: 'Refunded' });
// 'viewer' is look-only: devotees signed in by WhatsApp code, and staff accounts an admin made view-only.
// An admin can additionally give a staff viewer the scanner (canScan) and/or the cash desk (canCollectCash).
const ROLES = Object.freeze({ ADMIN: 'admin', USER: 'user', VIEWER: 'viewer' });
const VIEWER_ROLE = ROLES.VIEWER;
const ADMIN_ACTIONS = Object.freeze({ ACCEPTED: 'Accepted', REJECTED: 'Rejected', REFUNDED: 'Refunded' });

const PAYMENT_SOURCES = Object.freeze([
  'manual',
  'webhook',
  'manual_check',
  'manual_verification',
  'enhanced_auto_check',
  'immediate_verification',
  'cash',
]);

const REGISTRATION_URL = 'https://youthfest.harekrishnavizag.org/';

module.exports = { CANDIDATE_TYPES, PAYMENT_STATUS, ROLES, VIEWER_ROLE, ADMIN_ACTIONS, PAYMENT_SOURCES, REGISTRATION_URL };
