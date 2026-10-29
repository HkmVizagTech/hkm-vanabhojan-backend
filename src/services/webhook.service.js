const Candidate = require('../models/Candidate');
const { PAYMENT_STATUS } = require('../config/constants');
const logger = require('../utils/logger');
const payments = require('./payment.service');

const handlers = {
  async 'payment.captured'({ payment }) {
    const candidate = await Candidate.findOne({ orderId: payment.order_id });
    if (!candidate) return 'candidate_not_found';
    const { changed } = await payments.markPaid(candidate._id, { payment, source: 'webhook' });
    return changed ? 'paid' : 'already_processed';
  },

  async 'payment.failed'({ payment }) {
    const candidate = await Candidate.findOne({ orderId: payment.order_id });
    if (!candidate) return 'candidate_not_found';
    const updated = await payments.markFailed(candidate._id, { payment, source: 'webhook' });
    return updated ? 'failed' : 'already_processed';
  },

  async 'refund.processed'({ refund }) {
    const candidate = await Candidate.findOne({ paymentId: refund.payment_id });
    if (!candidate) return 'candidate_not_found';
    Object.assign(candidate, {
      paymentStatus: PAYMENT_STATUS.REFUNDED,
      refundStatus: 'processed',
      refundDate: new Date(),
      refundAmount: refund.amount / 100,
    });
    await candidate.save();
    return 'refunded';
  },

  async 'refund.failed'({ refund }) {
    const updated = await Candidate.findOneAndUpdate({ paymentId: refund.payment_id }, { $set: { refundStatus: 'failed' } });
    return updated ? 'refund_failed' : 'candidate_not_found';
  },
};

/** Processes a verified Razorpay webhook body. Always resolves with an outcome label. */
async function handleWebhook(body) {
  const handler = handlers[body.event];
  if (!handler) return { event: body.event, outcome: 'ignored' };
  const entities = {
    payment: body.payload?.payment?.entity,
    refund: body.payload?.refund?.entity,
  };
  const outcome = await handler(entities);
  logger.info({ event: body.event, outcome }, 'Razorpay webhook processed');
  return { event: body.event, outcome };
}

module.exports = { handleWebhook };
