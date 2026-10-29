const crypto = require('node:crypto');
const Candidate = require('../models/Candidate');
const { PAYMENT_STATUS } = require('../config/constants');
const ApiError = require('../utils/ApiError');
const { escapeRegex } = require('../utils/text');
const logger = require('../utils/logger');
const events = require('./event.service');
const qrPass = require('./qrPass.service');

const summary = c => ({
  id: c._id,
  name: c.name,
  whatsappNumber: c.whatsappNumber,
  email: c.email,
  collegeOrWorking: c.collegeOrWorking,
  college: c.college || c.companyName,
  paymentAmount: c.paymentAmount,
  attendanceToken: c.attendanceToken,
  checkedIn: Boolean(c.adminAttendance),
  qrSendStatus: c.qrSendStatus,
  qrSentAt: c.qrSentAt,
  collectedBy: c.collectedByName || c.collectedBy,
  cashCollectedAt: c.cashCollectedAt,
});

/** Tries to WhatsApp the pass and records the outcome. Never throws: the cash is already taken. */
async function deliverQr(candidate, event) {
  try {
    await qrPass.sendPass({ candidate, event });
    candidate.qrSendStatus = 'sent';
    candidate.qrSentAt = new Date();
    await candidate.save();
    return { ok: true };
  } catch (error) {
    logger.warn({ candidateId: candidate._id, err: error.message }, 'QR pass not sent');
    candidate.qrSendStatus = 'failed';
    await candidate.save();
    return { ok: false, error: error.message };
  }
}

/**
 * A walk-in pays in cash: register them as Paid for the current event, issue the QR and send it.
 * Works even when online registration is closed (the desk is on-site), but needs a current event.
 */
async function register({ checkIn, ...formData }, staff) {
  const event = await events.getCurrent();
  if (!event) throw ApiError.conflict('Create an event first: there is nothing to register people for yet');

  const duplicate = await Candidate.findOne({
    event: event._id,
    whatsappNumber: formData.whatsappNumber,
    paymentStatus: PAYMENT_STATUS.PAID,
    name: { $regex: `^${escapeRegex(formData.name)}$`, $options: 'i' },
  });
  if (duplicate) throw ApiError.conflict(`${duplicate.name} is already registered with this number. Open "Today's cash desk" to resend the QR.`);

  const now = new Date();
  const amount = events.feeFor(event, formData.collegeOrWorking);
  const candidate = await Candidate.create({
    ...formData,
    event: event._id,
    registrationDate: now,
    paymentStatus: PAYMENT_STATUS.PAID,
    paymentAmount: amount,
    paymentMethod: 'Cash',
    paymentDate: now,
    paymentUpdatedBy: 'cash',
    receipt: `cash_${now.getTime()}_${crypto.randomBytes(2).toString('hex')}`,
    collectedBy: staff.email,
    collectedByName: staff.name,
    cashCollectedAt: now,
    attendanceToken: crypto.randomBytes(16).toString('hex'),
    ...(checkIn ? { adminAttendance: true, adminAttendanceDate: now, adminAttendanceBy: staff.email, attendance: true, attendanceDate: now } : {}),
  });

  const whatsapp = await deliverQr(candidate, event);
  return { candidate: summary(candidate), amount, whatsapp };
}

/** Re-sends the QR (for example after a WhatsApp failure, or a wrong number corrected on the spot). */
async function resend(id) {
  const candidate = await Candidate.findById(id);
  if (!candidate) throw ApiError.notFound('Registration not found');
  if (candidate.paymentStatus !== PAYMENT_STATUS.PAID) throw ApiError.badRequest('Only paid registrations get a QR');
  const event = candidate.event ? await events.findOrFail(candidate.event) : await events.getCurrent();
  if (!event) throw ApiError.conflict('No event found');
  if (!candidate.attendanceToken) {
    candidate.attendanceToken = crypto.randomBytes(16).toString('hex');
    await candidate.save();
  }
  const whatsapp = await deliverQr(candidate, event);
  return { candidate: summary(candidate), whatsapp };
}

/** Cash taken for the current event. Volunteers see their own; admins see everyone's. */
async function list(staff) {
  const current = await events.getCurrent();
  const filter = { paymentMethod: 'Cash', collectedBy: { $exists: true }, ...(current ? { event: current._id } : {}) };
  if (staff.role !== 'admin') filter.collectedBy = staff.email;
  const rows = await Candidate.find(filter).sort({ cashCollectedAt: -1 }).limit(200);
  return {
    event: current && { id: current._id, name: current.name, fees: current.fees },
    totals: { people: rows.length, amount: rows.reduce((sum, c) => sum + (c.paymentAmount || 0), 0) },
    registrations: rows.map(summary),
  };
}

module.exports = { register, resend, list };
