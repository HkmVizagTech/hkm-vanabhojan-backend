const crypto = require('node:crypto');
const Candidate = require('../models/Candidate');
const { getRazorpay } = require('../config/razorpay');
const storage = require('./storage.service');
const { env, integrations } = require('../config/env');
const { PAYMENT_STATUS, ADMIN_ACTIONS } = require('../config/constants');
const events = require('./event.service');
const ApiError = require('../utils/ApiError');
const { toPaise } = require('../utils/text');
const logger = require('../utils/logger');
const whatsapp = require('./whatsapp.service');

const safeEqual = (a, b) => {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
};

const hmac = (secret, payload) => crypto.createHmac('sha256', secret).update(payload).digest('hex');

/** Checkout callback signature: HMAC(order_id|payment_id) with the key secret. */
const verifyCheckoutSignature = ({ orderId, paymentId, signature }) =>
  integrations.razorpay && safeEqual(hmac(env.RAZORPAY_KEY_SECRET, `${orderId}|${paymentId}`), signature);

/** Webhook signature: HMAC of the raw request body with the webhook secret. */
const verifyWebhookSignature = (rawBody, signature) =>
  integrations.razorpayWebhook && Boolean(signature) && safeEqual(hmac(env.RAZORPAY_WEBHOOK_SECRET, rawBody), signature);

/**
 * Creates the Razorpay order and the Pending candidate that goes with it.
 * The fee comes from the current event and the candidate type on the server; any amount sent by the client is ignored.
 */
async function createOrder({ formData, file }) {
  if (file && !integrations.storage) throw ApiError.unavailable('File storage is not configured');
  const event = await events.currentOpenEvent();
  const rupees = events.feeFor(event, formData.collegeOrWorking);
  const receipt = `rcpt_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;

  const order = await getRazorpay().orders.create({
    amount: toPaise(rupees),
    currency: 'INR',
    receipt,
    notes: { name: formData.name, whatsapp: formData.whatsappNumber },
  });

  let idCard = {};
  if (file && formData.collegeOrWorking === 'College') {
    idCard = { studentIdCardKey: (await storage.uploadIdCard(file)).key };
  }

  const candidate = await Candidate.create({
    ...formData,
    ...idCard,
    event: event._id,
    registrationDate: new Date(),
    paymentStatus: PAYMENT_STATUS.PENDING,
    paymentAmount: rupees,
    orderId: order.id,
    receipt,
  });
  logger.info({ candidateId: candidate._id, orderId: order.id }, 'Order created');
  return order;
}

/**
 * Moves a candidate to Paid exactly once. The conditional update makes this safe when the checkout
 * callback, the webhook and the reconciler race: only the winner sends the WhatsApp confirmation.
 * Returns { candidate, changed }.
 */
async function markPaid(candidateId, { payment, paymentId, source }) {
  const set = {
    paymentStatus: PAYMENT_STATUS.PAID,
    paymentUpdatedBy: source,
    paymentVerifiedAt: new Date(),
    paymentMethod: payment?.method || 'Online',
    paymentDate: payment?.created_at ? new Date(payment.created_at * 1000) : new Date(),
    paymentId: payment?.id || paymentId,
    paymentFailureReason: null,
  };
  if (payment) set.razorpayPaymentData = payment;

  const updated = await Candidate.findOneAndUpdate(
    { _id: candidateId, paymentStatus: { $in: [PAYMENT_STATUS.PENDING, PAYMENT_STATUS.FAILED] } },
    { $set: set },
    { new: true }
  );
  if (!updated) return { candidate: await Candidate.findById(candidateId), changed: false };

  await whatsapp.notifyRegistrationConfirmed(updated);
  return { candidate: updated, changed: true };
}

/** A failure never overrides a payment that is already confirmed. */
async function markFailed(candidateId, { payment, source }) {
  return Candidate.findOneAndUpdate(
    { _id: candidateId, paymentStatus: PAYMENT_STATUS.PENDING },
    {
      $set: {
        paymentStatus: PAYMENT_STATUS.FAILED,
        paymentId: payment.id,
        paymentDate: new Date(),
        paymentFailureReason: payment.error_reason || payment.error_description || 'Payment cancelled by user',
        razorpayPaymentData: payment,
        paymentUpdatedBy: source,
      },
    },
    { new: true }
  );
}

/** Looks the payment up at Razorpay: by stored payment id first, then through the order. */
async function findPaymentAtRazorpay(candidate) {
  const razorpay = getRazorpay();
  let payment = null;

  if (candidate.paymentId) {
    payment = await razorpay.payments.fetch(candidate.paymentId).catch(() => null);
    if (payment?.status === 'captured') return payment;
  }
  if (candidate.orderId) {
    const { items = [] } = await razorpay.orders.fetchPayments(candidate.orderId);
    payment = items.find(p => p.status === 'captured') || payment || items[0] || null;
  }
  return payment;
}

/** Asks Razorpay about one candidate and confirms the payment if it was captured. */
async function reconcileCandidate(candidate, source) {
  if (candidate.paymentStatus === PAYMENT_STATUS.PAID) return { candidate, changed: false, status: 'already_paid' };
  const payment = await findPaymentAtRazorpay(candidate);
  if (payment?.status !== 'captured') return { candidate, changed: false, status: 'still_pending' };
  const result = await markPaid(candidate._id, { payment, source });
  return { ...result, status: result.changed ? 'updated' : 'already_paid' };
}

/** Sweeps pending payments (used by the cron job and the admin "check now" button). */
async function reconcilePending({ limit, source = 'enhanced_auto_check' } = {}) {
  let query = Candidate.find({ paymentStatus: PAYMENT_STATUS.PENDING, orderId: { $exists: true, $ne: null } }).sort({ createdAt: -1 });
  if (limit) query = query.limit(limit);
  const pending = await query;

  const results = [];
  let updated = 0;
  for (const candidate of pending) {
    try {
      const outcome = await reconcileCandidate(candidate, source);
      if (outcome.changed) updated += 1;
      results.push({ id: candidate._id, name: candidate.name, status: outcome.status, paymentId: outcome.candidate?.paymentId });
    } catch (error) {
      logger.warn({ candidateId: candidate._id, err: error.message }, 'Payment check failed');
      results.push({ id: candidate._id, name: candidate.name, status: 'error', error: error.message });
    }
  }
  return { totalChecked: pending.length, totalUpdated: updated, results };
}

async function refund(candidate) {
  if (candidate.paymentStatus !== PAYMENT_STATUS.PAID || !candidate.paymentId) {
    throw ApiError.badRequest('No eligible payment found for refund');
  }
  let refundResult;
  try {
    refundResult = await getRazorpay().payments.refund(candidate.paymentId, {
      amount: toPaise(candidate.paymentAmount),
      speed: 'normal',
    });
  } catch (error) {
    throw new ApiError(502, `Failed to process refund: ${error.error?.description || error.message}`);
  }
  Object.assign(candidate, {
    paymentStatus: PAYMENT_STATUS.REFUNDED,
    adminAction: ADMIN_ACTIONS.REFUNDED,
    adminActionDate: new Date(),
    refundId: refundResult.id,
    refundStatus: 'processed',
    refundAmount: candidate.paymentAmount,
    refundDate: new Date(),
  });
  await candidate.save();
  return { candidate, refund: refundResult };
}

module.exports = {
  verifyCheckoutSignature,
  verifyWebhookSignature,
  createOrder,
  markPaid,
  markFailed,
  reconcileCandidate,
  reconcilePending,
  refund,
};
