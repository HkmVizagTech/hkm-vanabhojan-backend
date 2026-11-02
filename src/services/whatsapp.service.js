const mongoose = require('mongoose');
const { env, integrations } = require('../config/env');
const { TEMPLATES, isApproved } = require('../config/whatsapp');
const { CANDIDATE_TYPES } = require('../config/constants');
const Candidate = require('../models/Candidate');
const Event = require('../models/Event');
const { normalizePhone } = require('../utils/phone');
const { dateLabel } = require('../utils/dates');
const logger = require('../utils/logger');
const flaxxa = require('./flaxxa');

const LOG_LIMIT = 20;

/** Meta rejects empty parameters, so every one gets a safe stand-in. */
const clean = (value, fallback = '-') => (String(value ?? '').trim() ? String(value).trim() : fallback);

const messageIdOf = data => data?.messageId || data?.message_id || data?.messages?.[0]?.id || data?.data?.messageId || 'unknown';

/** Keeps the provider's answer with the registration so a missing message can be investigated later. */
async function record(candidate, entry) {
  if (!mongoose.isValidObjectId(candidate._id)) return;
  try {
    await Candidate.updateOne({ _id: candidate._id }, { $push: { whatsappLog: { $each: [{ ...entry, at: new Date() }], $slice: -LOG_LIMIT } } });
  } catch (error) {
    logger.warn({ candidateId: candidate._id, err: error.message }, 'Could not store the WhatsApp log');
  }
}

/**
 * Sends a template and never throws: a failed notification must not fail the request that triggered it.
 * Resolves to { ok: true, data, messageId } or { ok: false, error }.
 */
async function send({ candidate, template, params, header, kind }) {
  try {
    if (!integrations.whatsapp) return { ok: false, error: 'WhatsApp is not configured' };
    if (!isApproved(template)) {
      logger.warn({ candidateId: candidate._id, template }, 'WhatsApp template is not approved yet: skipped');
      return { ok: false, error: `Template ${template} is not approved yet` };
    }
    const to = normalizePhone(candidate.whatsappNumber);
    if (!to) return { ok: false, error: `Invalid WhatsApp number: ${candidate.whatsappNumber}` };

    const data = await flaxxa.sendTemplate({ to, template, params: params.map(p => clean(p)), header });
    logger.info({ candidateId: candidate._id, kind, template, response: data }, 'WhatsApp sent');
    await record(candidate, { kind, template, ok: true, response: data });
    return { ok: true, data, messageId: messageIdOf(data) };
  } catch (error) {
    logger.error({ candidateId: candidate._id, kind, template, err: error.message, response: error.providerResponse }, 'WhatsApp failed');
    await record(candidate, { kind, template, ok: false, error: error.message, response: error.providerResponse });
    return { ok: false, error: error.message };
  }
}

/** The event date as a message reads it. Looked up per candidate's own event; cached briefly for bulk sends. */
const eventDates = new Map();
async function eventDateFor(candidate) {
  const key = String(candidate.event || '');
  if (!key) return 'the event date';
  if (!eventDates.has(key)) {
    const event = await Event.findById(key).select('date');
    eventDates.set(key, event ? dateLabel(event.date) : 'the event date');
    setTimeout(() => eventDates.delete(key), 60_000).unref();
  }
  return eventDates.get(key);
}

const name = candidate => clean(candidate.name, 'Devotee');

const notifyRegistrationConfirmed = async candidate =>
  send({
    candidate,
    kind: 'registration',
    template: candidate.collegeOrWorking === CANDIDATE_TYPES.WORKING ? TEMPLATES.REGISTRATION_WORKING : TEMPLATES.REGISTRATION_STUDENT,
    params: [name(candidate), await eventDateFor(candidate)],
  });

const notifyAccepted = candidate =>
  send({
    candidate,
    kind: 'accept',
    template: candidate.gender === 'Male' ? TEMPLATES.ACCEPTED_MALE : TEMPLATES.ACCEPTED_FEMALE,
    params: [name(candidate)],
  });

const notifyRejected = candidate => send({ candidate, kind: 'reject', template: TEMPLATES.REJECTED, params: [name(candidate)] });

const sendReminder = async (candidate, time) =>
  send({ candidate, kind: 'reminder', template: TEMPLATES.REMINDER, params: [name(candidate), await eventDateFor(candidate), time] });

/** Send any approved template to a bare phone number (used for follow-up invitations). */
const sendTemplateTo = ({ phone, template, params, kind }) =>
  send({ candidate: { _id: phone, whatsappNumber: phone }, kind, template, params });

module.exports = { send, name, sendTemplateTo, notifyRegistrationConfirmed, notifyAccepted, notifyRejected, sendReminder };
