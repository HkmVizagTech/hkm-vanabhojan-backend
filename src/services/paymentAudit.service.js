const Candidate = require('../models/Candidate');
const { getRazorpay } = require('../config/razorpay');
const { PAYMENT_STATUS } = require('../config/constants');
const candidates = require('./candidate.service');
const logger = require('../utils/logger');

const rupees = paise => Math.round(paise || 0) / 100;
const sum = (rows, pick) => rows.reduce((total, row) => total + (Number(pick(row)) || 0), 0);

/** Runs `worker` over `items` with a few requests in flight, so Razorpay's rate limit is not tripped. */
async function pool(items, size, worker) {
  const out = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(size, items.length) }, async () => {
    for (;;) {
      const i = cursor++;
      if (i >= items.length) return;
      out[i] = await worker(items[i]);
    }
  });
  await Promise.all(runners);
  return out;
}

/** The payment that counts for an order: a captured (or since refunded) one, preferring the most recent. */
const settledPayment = items =>
  items
    .filter(p => p.status === 'captured' || p.status === 'refunded')
    .sort((a, b) => b.created_at - a.created_at)[0] || null;

const refundedPaise = p => (p.status === 'refunded' ? p.amount : p.amount_refunded || 0);

/** Compares one registration with what Razorpay holds for its order. Returns an issue, or null when they agree. */
function compare(candidate, payment, lookupError) {
  const base = {
    id: candidate._id,
    name: candidate.name,
    phone: candidate.whatsappNumber,
    ourStatus: candidate.paymentStatus,
    ourAmount: candidate.paymentAmount,
    paymentId: payment?.id || candidate.paymentId || null,
    razorpayStatus: payment?.status || 'no payment',
    razorpayAmount: payment ? rupees(payment.amount) : 0,
  };
  if (lookupError) return { ...base, type: 'lookup_failed', detail: lookupError };

  const paid = candidate.paymentStatus === PAYMENT_STATUS.PAID;
  const refundedHere = candidate.paymentStatus === PAYMENT_STATUS.REFUNDED;
  const fullyRefunded = payment && refundedPaise(payment) >= payment.amount;

  if (payment && !paid && !refundedHere) return { ...base, type: 'captured_not_marked_paid', detail: 'Razorpay has the money, but this registration is not marked Paid. Run "Check pending payments".' };
  if (!payment && (paid || refundedHere)) return { ...base, type: 'not_captured_at_razorpay', detail: `Marked ${candidate.paymentStatus} here, but Razorpay has no captured payment for this order.` };
  if (!payment) return null;
  if (paid && fullyRefunded) return { ...base, type: 'refunded_at_razorpay_only', detail: 'Refunded at Razorpay, but still marked Paid here.' };
  if (refundedHere && !fullyRefunded) return { ...base, type: 'refunded_here_only', detail: 'Marked Refunded here, but Razorpay shows no full refund.' };
  if (Math.round((candidate.paymentAmount || 0) * 100) !== payment.amount) return { ...base, type: 'amount_differs', detail: `Registration says ₹${candidate.paymentAmount}, Razorpay captured ₹${rupees(payment.amount)}.` };
  return null;
}

/**
 * Checks the dashboard against Razorpay: totals side by side, and every registration that disagrees.
 * Only online payments can be checked; cash taken at the desk is reported separately.
 */
async function audit({ event } = {}) {
  const scope = await candidates.eventFilter(event);
  const everyone = await Candidate.find(scope).select('name whatsappNumber paymentStatus paymentAmount paymentMethod paymentId orderId');
  const cash = everyone.filter(c => c.paymentStatus === PAYMENT_STATUS.PAID && c.paymentMethod === 'Cash');
  const online = everyone.filter(c => c.orderId);
  const razorpay = getRazorpay();

  const lookups = await pool(online, 5, async candidate => {
    try {
      const { items = [] } = await razorpay.orders.fetchPayments(candidate.orderId);
      return { candidate, payment: settledPayment(items) };
    } catch (error) {
      logger.warn({ candidateId: candidate._id, err: error.message }, 'Audit lookup failed');
      return { candidate, error: error.error?.description || error.message };
    }
  });

  const settled = lookups.filter(l => l.payment);
  const issues = lookups.map(l => compare(l.candidate, l.payment, l.error)).filter(Boolean);

  const dashboardPaid = sum(online.filter(c => c.paymentStatus === PAYMENT_STATUS.PAID), c => c.paymentAmount);
  const capturedPaise = sum(settled, l => l.payment.amount);
  const refundedTotalPaise = sum(settled, l => refundedPaise(l.payment));
  const razorpayNet = rupees(capturedPaise - refundedTotalPaise);

  return {
    checkedAt: new Date(),
    checked: online.length,
    dashboard: {
      paidOnline: dashboardPaid,
      refunded: sum(online.filter(c => c.paymentStatus === PAYMENT_STATUS.REFUNDED), c => c.paymentAmount),
      cash: sum(cash, c => c.paymentAmount),
    },
    razorpay: { captured: rupees(capturedPaise), refunded: rupees(refundedTotalPaise), net: razorpayNet },
    difference: Math.round((dashboardPaid - razorpayNet) * 100) / 100,
    matches: issues.length === 0 && dashboardPaid === razorpayNet,
    issues,
  };
}

module.exports = { audit };
