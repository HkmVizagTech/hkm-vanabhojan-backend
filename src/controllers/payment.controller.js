const Candidate = require('../models/Candidate');
const payments = require('../services/payment.service');
const candidates = require('../services/candidate.service');
const { handleWebhook } = require('../services/webhook.service');
const ApiError = require('../utils/ApiError');
const logger = require('../utils/logger');
const { PAYMENT_STATUS } = require('../config/constants');
const { integrations } = require('../config/env');

const summary = c => ({
  name: c.name,
  email: c.email,
  paymentStatus: c.paymentStatus,
  paymentId: c.paymentId,
  orderId: c.orderId,
  paymentAmount: c.paymentAmount,
});

exports.createOrder = async (req, res) => {
  const order = await payments.createOrder({ formData: req.body.formData });
  res.json(order);
};

exports.createOrderWithFile = async (req, res) => {
  const { formData } = req.body;
  if (formData.collegeOrWorking === 'College' && !req.file) {
    throw ApiError.badRequest('Student ID card is required');
  }
  const order = await payments.createOrder({ formData, file: req.file });
  res.json(order);
};

exports.verifyPayment = async (req, res) => {
  const { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signature } = req.body;
  if (!payments.verifyCheckoutSignature({ orderId, paymentId, signature })) {
    return res.status(400).json({ status: 'fail', message: 'Payment verification failed' });
  }
  const candidate = await Candidate.findOne({ orderId });
  if (!candidate) return res.status(404).json({ status: 'fail', message: 'Candidate not found' });

  const { candidate: result, changed } = await payments.markPaid(candidate._id, { paymentId, source: 'manual' });
  res.json({ message: changed ? 'success' : 'Already Registered', candidate: summary(result) });
};

/** Razorpay server-to-server webhook. `req.body` is the raw Buffer (see app.js). */
exports.webhook = async (req, res) => {
  if (!integrations.razorpayWebhook) throw new ApiError(500, 'Webhook secret not configured');
  const signature = req.headers['x-razorpay-signature'];
  if (!signature) throw ApiError.badRequest('No signature provided');
  if (!payments.verifyWebhookSignature(req.body, signature)) throw ApiError.badRequest('Invalid signature');

  let body;
  try {
    body = JSON.parse(req.body.toString('utf8'));
  } catch {
    throw ApiError.badRequest('Malformed JSON body');
  }
  const result = await handleWebhook(body);
  logger.debug(result, 'webhook');
  res.json({ status: 'ok', ...result });
};

exports.paymentStatus = async (req, res) => {
  const candidate = await candidates.paymentStatusFor(req.params.id);
  res.json({ success: true, status: 'success', candidate });
};

exports.verifyImmediately = async (req, res) => {
  const { orderId, paymentId } = req.body;
  const candidate = await Candidate.findOne(orderId ? { orderId } : { paymentId });
  if (!candidate) return res.status(404).json({ success: false, message: 'Candidate not found' });

  const outcome = await payments.reconcileCandidate(candidate, 'immediate_verification');
  const verified = outcome.candidate.paymentStatus === PAYMENT_STATUS.PAID;
  res.json({
    success: verified,
    message: verified ? 'Payment verified and updated successfully' : 'Payment not found or not captured yet',
    candidate: summary(outcome.candidate),
  });
};

exports.checkPending = async (req, res) => {
  const limit = Number(req.query.limit) || undefined;
  const result = await payments.reconcilePending({ limit, source: 'manual_check' });
  res.json({
    status: 'success',
    message: `Checked ${result.totalChecked} pending payments, updated ${result.totalUpdated}`,
    ...result,
  });
};

exports.forceCheck = async (req, res) => {
  const candidate = await candidates.findOrFail(req.params.candidateId);
  if (!candidate.orderId) throw ApiError.badRequest('No order ID found for this candidate');
  const outcome = await payments.reconcileCandidate(candidate, 'manual_verification');
  res.json({
    status: outcome.candidate.paymentStatus === PAYMENT_STATUS.PAID ? 'success' : 'pending',
    message:
      outcome.status === 'updated'
        ? 'Payment verified and updated successfully'
        : outcome.status === 'already_paid'
          ? 'Payment already confirmed'
          : 'Payment is still pending or failed',
    candidate: outcome.candidate,
  });
};
