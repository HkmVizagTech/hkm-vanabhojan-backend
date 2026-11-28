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

/**
 * GET /integrations/person?phone=<10 digits>
 *
 * One person, looked up by mobile number, for Yatra Clubbing's registration form:
 *   { found, attended, person: { name, gender, age, college, course, year } }
 *
 *   found     — this number has a registration here (any edition)
 *   attended  — they paid AND were scanned in / marked present at some edition
 *   person    — details to pre-fill the form, taken from their newest PAID registration
 *               (or newest registration if none paid). Only what the form needs: no email,
 *               no date of birth, no ID card, no payment data.
 */
router.get('/person', publicLimiter, requireIntegrationKey, async (req, res) => {
  const phone = String(req.query.phone || '').replace(/D/g, '').slice(-10);
  if (!/^[6-9][0-9]{9}$/.test(phone)) throw ApiError.badRequest('phone must be a 10-digit mobile number');

  const rows = await Candidate.find({ whatsappNumber: { $in: ['91' + phone, phone, '+91' + phone] } })
    .select('name gender dob college course year collegeOrWorking paymentStatus attendance adminAttendance registrationDate')
    .sort({ registrationDate: -1 })
    .lean();

  if (rows.length === 0) return res.json({ status: 'success', found: false, attended: false, person: null });

  const paid = rows.filter(r => r.paymentStatus === PAYMENT_STATUS.PAID);
  const attended = paid.some(r => r.attendance === true || r.adminAttendance === true);
  const src = paid[0] || rows[0];

  let age = null;
  if (src.dob) {
    const d = new Date(src.dob);
    if (!Number.isNaN(d.getTime())) {
      const now = new Date();
      age = now.getFullYear() - d.getFullYear() - (now < new Date(now.getFullYear(), d.getMonth(), d.getDate()) ? 1 : 0);
      if (age < 5 || age > 90) age = null;
    }
  }

  res.json({
    status: 'success',
    found: true,
    attended,
    person: {
      name: src.name || '',
      gender: src.gender || '',
      age,
      college: src.collegeOrWorking === 'Working' ? '' : (src.college || ''),
      course: src.course || '',
      year: src.year || '',
    },
  });
});

module.exports = router;
