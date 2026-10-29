const CANDIDATE_TYPES = Object.freeze({ COLLEGE: 'College', WORKING: 'Working' });
const PAYMENT_STATUS = Object.freeze({ PENDING: 'Pending', PAID: 'Paid', FAILED: 'Failed', REFUNDED: 'Refunded' });
const ROLES = Object.freeze({ ADMIN: 'admin', USER: 'user' });
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

module.exports = { CANDIDATE_TYPES, PAYMENT_STATUS, ROLES, ADMIN_ACTIONS, PAYMENT_SOURCES, REGISTRATION_URL };
