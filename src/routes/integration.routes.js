const { Router } = require('express');
const Candidate = require('../models/Candidate');
const { PAYMENT_STATUS } = require('../config/constants');
const { requireIntegrationKey } = require('../middlewares/apiKey');
const { publicLimiter } = require('../middlewares/rateLimit');
const ApiError = require('../utils/ApiError');

const router = Router();

/**
 * GET /integrations/attendees[?event=<id>]
 *
 * Everyone who actually ATTENDED (their QR was scanned or an admin marked them present) and had
 * paid, as { name, phone } with the phone as the plain 10-digit number. Optional ?event=<id>
 * limits it to one edition; by default it covers every edition. One entry per phone number.
 *
 * ?who=paid returns everyone who PAID (whether or not they were scanned in yet) — useful before
 * the festival's gate scanning has happened. The default, ?who=attended, is only people present.
 *
 * Used by Yatra Clubbing to give past attendees a special price and skip the student-ID upload.
 */
router.get('/attendees', publicLimiter, requireIntegrationKey, async (req, res) => {
  const who = String(req.query.who || 'attended');
  if (!['attended', 'paid'].includes(who)) throw ApiError.badRequest('who must be "attended" or "paid"');
  const filter = { paymentStatus: PAYMENT_STATUS.PAID };
  if (who === 'attended') filter.$or = [{ attendance: true }, { adminAttendance: true }];
  if (req.query.event) {
    if (!/^[a-f0-9]{24}$/i.test(String(req.query.event))) throw ApiError.badRequest('Invalid event id');
    filter.event = String(req.query.event);
  }

  const rows = await Candidate.find(filter).select('name whatsappNumber registrationDate').sort({ registrationDate: -1 }).lean();

  const byPhone = new Map();
  for (const r of rows) {
    const phone = String(r.whatsappNumber || '').replace(/\D/g, '').slice(-10);
    if (phone.length !== 10 || byPhone.has(phone)) continue; // newest registration's name wins
    byPhone.set(phone, { name: r.name || '', phone });
  }

  res.json({ status: 'success', count: byPhone.size, attendees: [...byPhone.values()] });
});

module.exports = router;
