const Candidate = require('../models/Candidate');
const Event = require('../models/Event');
const qrPass = require('./qrPass.service');
const logger = require('../utils/logger');

/** Students who pay online are checked by an admin first; everyone else (and cash-desk students) is verified at payment. */
const needsIdVerification = c => c.collegeOrWorking === 'College' && c.paymentMethod !== 'Cash';

/**
 * Issues the entry token if needed, sends the QR pass over WhatsApp and records the outcome.
 * Never throws: a delivery problem must not undo a payment or an approval. Resolves to { ok, error? }.
 */
async function deliverPass(candidate) {
  try {
    const { ensureToken } = require('./attendance.service'); // lazy: attendance.service depends on candidate.service
    const ready = await ensureToken(candidate);
    const event = await Event.findById(ready.event);
    await qrPass.sendPass({ candidate: ready, event });
    await Candidate.updateOne({ _id: ready._id }, { $set: { qrSendStatus: 'sent', qrSentAt: new Date() } });
    return { ok: true };
  } catch (error) {
    logger.warn({ candidateId: candidate._id, err: error.message }, 'QR pass not sent');
    await Candidate.updateOne({ _id: candidate._id }, { $set: { qrSendStatus: 'failed' } });
    return { ok: false, error: error.message };
  }
}

module.exports = { needsIdVerification, deliverPass };
