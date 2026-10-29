const Candidate = require('../models/Candidate');
const { PAYMENT_STATUS, ADMIN_ACTIONS } = require('../config/constants');
const ApiError = require('../utils/ApiError');
const { escapeRegex } = require('../utils/text');
const payments = require('./payment.service');
const events = require('./event.service');
const whatsapp = require('./whatsapp.service');

const findOrFail = async id => {
  const candidate = await Candidate.findById(id);
  if (!candidate) throw ApiError.notFound('Candidate not found');
  return candidate;
};

/** Resolves the `event` query value to a Mongo filter: an id, "all", or (omitted) the current event. */
async function eventFilter(event) {
  if (event === 'all') return {};
  if (event) return { event };
  const current = await events.getCurrent();
  return current ? { event: current._id } : {};
}

const list = filter => Candidate.find(filter).select('-razorpayPaymentData').sort({ registrationDate: -1 });

/** Public payment-status lookup used by the thank-you page; exposes only what that page shows. */
async function paymentStatusFor(id) {
  let candidate = await Candidate.findOne({ $or: [{ paymentId: id }, { orderId: id }] });
  if (!candidate) throw ApiError.notFound('Candidate not found');

  // Still pending but Razorpay may already have captured it (webhook delayed): settle it now.
  if (candidate.paymentStatus === PAYMENT_STATUS.PENDING) {
    try {
      candidate = (await payments.reconcileCandidate(candidate, 'manual_verification')).candidate || candidate;
    } catch {
      /* Razorpay unreachable: report the stored status */
    }
  }

  return {
    name: candidate.name,
    email: candidate.email,
    paymentStatus: candidate.paymentStatus,
    paymentFailureReason: candidate.paymentFailureReason,
    orderId: candidate.orderId,
    paymentId: candidate.paymentId,
    paymentDate: candidate.paymentDate,
    paymentAmount: candidate.paymentAmount,
  };
}

async function accept(id) {
  const candidate = await findOrFail(id);
  Object.assign(candidate, { adminAction: ADMIN_ACTIONS.ACCEPTED, adminActionDate: new Date() });
  await candidate.save();
  await whatsapp.notifyAccepted(candidate);
  return candidate;
}

async function reject(id) {
  const candidate = await findOrFail(id);
  Object.assign(candidate, { adminAction: ADMIN_ACTIONS.REJECTED, adminActionDate: new Date() });
  await candidate.save();
  await whatsapp.notifyRejected(candidate);
  return candidate;
}

async function refund(id) {
  return payments.refund(await findOrFail(id));
}

async function update(id, changes) {
  const candidate = await Candidate.findByIdAndUpdate(id, { $set: changes }, { new: true, runValidators: true });
  if (!candidate) throw ApiError.notFound('Candidate not found');
  return candidate;
}

async function remove(id) {
  const candidate = await Candidate.findByIdAndDelete(id);
  if (!candidate) throw ApiError.notFound('Candidate not found');
  return candidate;
}

async function removeByName(name) {
  const result = await Candidate.deleteMany({ name: { $regex: escapeRegex(name), $options: 'i' } });
  return result.deletedCount;
}

/** Bulk reminder to every paid registration with a valid number. Sequential to respect provider limits. */
async function sendReminders(time) {
  const paid = await Candidate.find({ paymentStatus: PAYMENT_STATUS.PAID });
  const results = [];
  for (const candidate of paid) {
    const outcome = await whatsapp.sendReminder(candidate, time);
    results.push({ user: candidate.name, number: candidate.whatsappNumber, status: outcome.ok ? 'sent' : 'failed', ...(outcome.ok ? {} : { error: outcome.error }) });
  }
  return { total: paid.length, valid: results.filter(r => r.status === 'sent').length, results };
}

module.exports = { eventFilter, findOrFail, list, paymentStatusFor, accept, reject, refund, update, remove, removeByName, sendReminders };
