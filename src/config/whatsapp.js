const { env } = require('./env');

/** Everything about the WhatsApp templates in one place: names, language and which ones may be sent. */
const LANGUAGE = 'en_US';

const TEMPLATES = Object.freeze({
  REGISTRATION_STUDENT: 'vb_registration_student',
  REGISTRATION_WORKING: 'vb_registration_working',
  ACCEPTED_MALE: 'vb_accepted_male',
  ACCEPTED_FEMALE: 'vb_accepted_female',
  REJECTED: 'vb_rejected',
  REMINDER: 'vb_reminder',
  QR_PASS: 'vb_qr_pass',
  CERTIFICATE: 'vb_certificate',
});

// WA_APPROVED_TEMPLATES: "all" (default) or a comma-separated list of names. Anything not listed is logged and skipped,
// so a template that Meta has not approved yet never goes out. The follow-up template is only used once its name is set.
const approvedList = env.WA_APPROVED_TEMPLATES.trim().toLowerCase();
const approved = new Set(approvedList === 'all' ? Object.values(TEMPLATES) : approvedList.split(',').map(s => s.trim()).filter(Boolean));
if (env.WA_TEMPLATE_FOLLOWUP) approved.add(env.WA_TEMPLATE_FOLLOWUP);

const isApproved = name => approved.has(name);

module.exports = { LANGUAGE, TEMPLATES, isApproved };
