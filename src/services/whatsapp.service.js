const { env, integrations } = require('../config/env');
const { CANDIDATE_TYPES } = require('../config/constants');
const { normalizePhone } = require('../utils/phone');
const logger = require('../utils/logger');
const gupshup = require('./gupshup');

/**
 * Sends a template and never throws: a failed notification must not fail the request that triggered it.
 * Resolves to { ok: true, data } or { ok: false, error }.
 */
async function sendSafely({ candidate, templateId, params, kind }) {
  try {
    if (!integrations.gupshup) return { ok: false, error: 'WhatsApp is not configured' };
    const to = normalizePhone(candidate.whatsappNumber);
    if (!to) return { ok: false, error: `Invalid WhatsApp number: ${candidate.whatsappNumber}` };
    const data = await gupshup.sendTemplate({ to, templateId, params });
    logger.info({ candidateId: candidate._id, kind }, 'WhatsApp sent');
    return { ok: true, data };
  } catch (error) {
    logger.error({ candidateId: candidate._id, kind, err: error.message }, 'WhatsApp failed');
    return { ok: false, error: error.message };
  }
}

const registrationTemplate = candidate =>
  candidate.collegeOrWorking === CANDIDATE_TYPES.WORKING
    ? env.WA_TEMPLATE_REGISTRATION_WORKING
    : env.WA_TEMPLATE_REGISTRATION_STUDENT;

const notifyRegistrationConfirmed = candidate =>
  sendSafely({ candidate, kind: 'registration', templateId: registrationTemplate(candidate), params: [candidate.name] });

const notifyAccepted = candidate =>
  sendSafely({
    candidate,
    kind: 'accept',
    templateId: candidate.gender === 'Male' ? env.WA_TEMPLATE_ACCEPT_MALE : env.WA_TEMPLATE_ACCEPT_FEMALE,
    params: [candidate.name],
  });

const notifyRejected = candidate =>
  sendSafely({ candidate, kind: 'reject', templateId: env.WA_TEMPLATE_REJECT, params: [candidate.name] });

const sendReminder = (candidate, time) =>
  sendSafely({ candidate, kind: 'reminder', templateId: env.WA_TEMPLATE_REMINDER, params: [candidate.name, time] });

/** Send any approved template to a bare phone number (used for follow-up invitations). */
const sendTemplateTo = ({ phone, templateId, params, kind }) =>
  sendSafely({ candidate: { _id: phone, whatsappNumber: phone }, kind, templateId, params });

module.exports = { sendTemplateTo, notifyRegistrationConfirmed, notifyAccepted, notifyRejected, sendReminder };
