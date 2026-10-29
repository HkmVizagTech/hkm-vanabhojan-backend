const crypto = require('node:crypto');
const Candidate = require('../models/Candidate');
const { PAYMENT_STATUS, REGISTRATION_URL } = require('../config/constants');
const ApiError = require('../utils/ApiError');
const candidates = require('./candidate.service');
const { normalizePhone } = require('../utils/phone');

const NOT_REGISTERED = `Number not registered! Please register here: ${REGISTRATION_URL} And please visit the enquiry counter.`;
const isAttended = c => c.attendance === true || c.adminAttendance === true;
const orgOf = c => c.college || c.companyName;

/** Existing tokens are the candidate id; new ones are random so they cannot be guessed. */
async function ensureToken(candidate) {
  if (candidate.attendanceToken) return candidate;
  const token = crypto.randomBytes(16).toString('hex');
  const updated = await Candidate.findOneAndUpdate(
    { _id: candidate._id, attendanceToken: null },
    { $set: { attendanceToken: token } },
    { new: true }
  );
  return updated || (await Candidate.findById(candidate._id));
}

/** Every Paid registration under one WhatsApp number, or the right error when there is none. */
async function paidRegistrationsFor(rawNumber, paymentMessage) {
  const number = normalizePhone(rawNumber);
  if (!number) throw ApiError.badRequest('Invalid WhatsApp number format');

  // Only the current edition: last year's QR codes must not show up at this year's gate.
  const scope = await candidates.eventFilter();
  const paid = await Candidate.find({ whatsappNumber: number, paymentStatus: PAYMENT_STATUS.PAID, ...scope }).sort({ createdAt: -1 });
  if (paid.length) return paid;

  const any = await Candidate.exists({ whatsappNumber: number, ...scope });
  throw any ? ApiError.forbidden(paymentMessage) : ApiError.notFound(NOT_REGISTERED);
}

/** QR codes a person shows at the gate. Read-only: viewing a QR never marks attendance. */
async function getQrCodes(rawNumber) {
  const paid = await paidRegistrationsFor(rawNumber, 'Payment not completed. QR codes cannot be generated.');
  const candidates = [];
  for (const registration of paid) {
    const c = await ensureToken(registration);
    candidates.push({
      id: c._id,
      name: c.name,
      email: c.email,
      college: orgOf(c),
      course: c.course,
      year: c.year,
      gender: c.gender,
      attendanceToken: c.attendanceToken,
      attendanceDate: c.attendanceDate,
      adminAttendanceDate: c.adminAttendanceDate,
      attendance: c.attendance,
      adminAttendance: c.adminAttendance,
      isAttended: isAttended(c),
    });
  }
  return {
    status: 'success',
    message: `Found ${candidates.length} registration(s) for this number`,
    totalCandidates: candidates.length,
    candidates,
  };
}

/** Legacy self-service check-in by phone number (staff only). Marks every paid registration present. */
async function markByPhone(rawNumber) {
  const paid = await paidRegistrationsFor(rawNumber, 'Payment not completed. Attendance cannot be marked.');
  let allAlreadyMarked = true;
  const candidates = [];

  for (const registration of paid) {
    let c = await ensureToken(registration);
    const alreadyMarked = c.attendance === true;
    if (!alreadyMarked) {
      c = await Candidate.findByIdAndUpdate(c._id, { $set: { attendance: true, attendanceDate: new Date() } }, { new: true });
      allAlreadyMarked = false;
    }
    candidates.push({
      id: c._id,
      name: c.name,
      email: c.email,
      college: orgOf(c),
      course: c.course,
      year: c.year,
      gender: c.gender,
      attendanceToken: c.attendanceToken,
      attendanceDate: c.attendanceDate,
      alreadyMarked: true,
    });
  }

  const count = paid.length;
  return {
    status: allAlreadyMarked ? 'already-marked' : 'success',
    message: allAlreadyMarked
      ? `Attendance already taken for all ${count} registration(s)`
      : `Attendance marked successfully for all ${count} registration(s)`,
    totalCandidates: count,
    candidates,
  };
}

const memberView = (member, scannedId, wasAlreadyScanned) => ({
  id: member._id,
  name: member.name,
  email: member.email,
  phone: member.whatsappNumber,
  gender: member.gender,
  college: orgOf(member),
  course: member.course,
  year: member.year,
  attendanceToken: member.attendanceToken,
  adminAttendance: member.adminAttendance || false,
  adminAttendanceDate: member.adminAttendanceDate,
  wasJustScanned: member._id.equals(scannedId),
  wasAlreadyScanned: member._id.equals(scannedId) ? wasAlreadyScanned : Boolean(member.adminAttendance),
});

/**
 * Gate scan. The first scan flips adminAttendance atomically, so two volunteers scanning the same
 * QR at once cannot both see "new scan". The whole family (same number) is returned for display.
 */
async function scan(token, staff) {
  const candidate = await Candidate.findOne({ attendanceToken: token });
  if (!candidate) throw ApiError.notFound('QR Code not found');
  if (candidate.paymentStatus !== PAYMENT_STATUS.PAID) {
    throw ApiError.forbidden('Payment not completed. Attendance cannot be marked.');
  }

  const now = new Date();
  const marked = await Candidate.findOneAndUpdate(
    { _id: candidate._id, adminAttendance: { $ne: true } },
    {
      $set: {
        adminAttendance: true,
        adminAttendanceDate: now,
        adminAttendanceBy: staff?.email,
        attendance: true,
        attendanceDate: candidate.attendance ? candidate.attendanceDate : now,
      },
    },
    { new: true }
  );
  const wasAlreadyScanned = !marked;
  const scanned = marked || candidate;

  const family = await Candidate.find({
    whatsappNumber: scanned.whatsappNumber,
    paymentStatus: PAYMENT_STATUS.PAID,
    ...(scanned.event ? { event: scanned.event } : {}),
  }).sort({ createdAt: 1 });

  return {
    status: wasAlreadyScanned ? 'already-marked' : 'success',
    message: wasAlreadyScanned
      ? `Attendance already marked for ${scanned.name}`
      : `Attendance marked successfully for ${scanned.name}`,
    totalMembers: family.length,
    scannedPerson: scanned.name,
    newlyScanned: wasAlreadyScanned ? 0 : 1,
    data: {
      id: scanned._id,
      name: scanned.name,
      email: scanned.email,
      phone: scanned.whatsappNumber,
      gender: scanned.gender,
      college: orgOf(scanned),
      course: scanned.course,
      year: scanned.year,
      adminAttendance: true,
      adminAttendanceDate: scanned.adminAttendanceDate,
      wasAlreadyScanned,
    },
    familyMembers: family.map(member => memberView(member, scanned._id, wasAlreadyScanned)),
  };
}

async function listScanned(event) {
  const scope = await candidates.eventFilter(event);
  const list = await Candidate.find({ adminAttendance: true, ...scope })
    .select('name email whatsappNumber college companyName course gender year attendanceDate adminAttendanceDate')
    .sort({ adminAttendanceDate: -1 });
  return { status: 'success', total: list.length, candidates: list };
}

async function attendanceReport({ date, status, event }) {
  const query = { ...(await candidates.eventFilter(event)) };
  if (status === 'present') query.attendance = true;
  if (status === 'absent') query.attendance = { $ne: true };
  if (date) {
    const start = new Date(`${date}T00:00:00`);
    const end = new Date(`${date}T23:59:59.999`);
    query.attendanceDate = { $gte: start, $lte: end };
  }
  const candidates = await Candidate.find(query)
    .select('name email whatsappNumber college course attendance attendanceDate')
    .sort({ attendanceDate: -1 });
  const present = candidates.filter(c => c.attendance).length;
  return { status: 'success', summary: { total: candidates.length, present, absent: candidates.length - present }, candidates };
}

module.exports = { getQrCodes, markByPhone, scan, listScanned, attendanceReport };
