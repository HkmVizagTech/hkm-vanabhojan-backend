const crypto = require('node:crypto');
const axios = require('axios');
const jwt = require('jsonwebtoken');
const Devotee = require('../models/Devotee');
const DevoteeOtp = require('../models/DevoteeOtp');
const { env, integrations } = require('../config/env');
const { normalizePhone } = require('../utils/phone');
const ApiError = require('../utils/ApiError');
const logger = require('../utils/logger');
const { VIEWER_ROLE } = require('../config/constants');

const OTP_MINUTES = 10;
const COOLDOWN_SECONDS = 60;
const MAX_ATTEMPTS = 5;
const sha = code => crypto.createHash('sha256').update(`${code}:${env.JWT_SECRET}`).digest('hex');

// ---- the list (admin) ----

const list = () => Devotee.find().sort({ name: 1 });

async function add({ name, whatsappNumber }) {
  if (await Devotee.exists({ whatsappNumber })) throw ApiError.conflict('This number is already on the list');
  return Devotee.create({ name, whatsappNumber });
}

/** Adds many at once. Numbers already listed or invalid are skipped and reported, never duplicated. */
async function addMany(rows) {
  const seen = new Set();
  const result = { added: 0, duplicates: 0, invalid: [] };
  for (const row of rows) {
    const whatsappNumber = normalizePhone(row.phone);
    const name = String(row.name ?? '').trim();
    if (!whatsappNumber || !name) {
      result.invalid.push(`${name || '(no name)'} ${row.phone ?? ''}`.trim());
      continue;
    }
    if (seen.has(whatsappNumber) || (await Devotee.exists({ whatsappNumber }))) {
      result.duplicates += 1;
      continue;
    }
    seen.add(whatsappNumber);
    await Devotee.create({ name, whatsappNumber });
    result.added += 1;
  }
  return result;
}

async function update(id, changes) {
  const devotee = await Devotee.findByIdAndUpdate(id, changes, { new: true, runValidators: true });
  if (!devotee) throw ApiError.notFound('Devotee not found');
  return devotee;
}

async function remove(id) {
  const devotee = await Devotee.findByIdAndDelete(id);
  if (!devotee) throw ApiError.notFound('Devotee not found');
  await DevoteeOtp.deleteOne({ whatsappNumber: devotee.whatsappNumber });
}

// ---- sign in by a code on WhatsApp ----

/** Sends the code through Flaxxa's authentication template. The code goes in the body and in the copy-code button. */
async function sendCodeMessage(to, code) {
  if (!integrations.whatsapp) throw ApiError.unavailable('WhatsApp is not configured');
  const response = await axios.post(
    `${env.FLAXXA_BASE_URL}/sendtemplatemessage`,
    {
      token: env.FLAXXA_API_TOKEN,
      phone: to,
      template_name: env.WA_TEMPLATE_OTP,
      template_language: 'en',
      components: [
        { type: 'body', parameters: [{ type: 'text', text: code }] },
        { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: code }] },
      ],
    },
    { headers: { 'Content-Type': 'application/json' }, timeout: 15000, validateStatus: () => true }
  );
  // Flaxxa answers 200 even when Meta rejects the message: a message id is the only proof of delivery.
  const id = response.data?.message_wamid || response.data?.wamid;
  if (!id) {
    logger.error({ to, response: response.data }, 'Sign-in code was not accepted by WhatsApp');
    throw ApiError.badGateway('Could not send the code on WhatsApp right now. Please try again shortly.');
  }
}

let sender = sendCodeMessage;
/** Tests swap this so no real message is sent. */
const setCodeSender = fn => {
  sender = fn || sendCodeMessage;
};

async function requestCode(phoneInput) {
  const whatsappNumber = normalizePhone(phoneInput);
  if (!whatsappNumber) throw ApiError.badRequest('Enter your 10-digit WhatsApp number');
  // Only listed numbers ever get a message, so nobody can use this to send WhatsApps to strangers.
  const devotee = await Devotee.findOne({ whatsappNumber, active: true });
  if (!devotee) throw ApiError.notFound('This number is not on the devotee list. Please contact the temple office to be added.');

  const last = await DevoteeOtp.findOne({ whatsappNumber });
  if (last) {
    const wait = COOLDOWN_SECONDS - Math.floor((Date.now() - last.lastSentAt.getTime()) / 1000);
    if (wait > 0) throw ApiError.tooMany(`Please wait ${wait}s before asking for another code.`);
  }
  const code = crypto.randomInt(100000, 1000000).toString();
  await DevoteeOtp.findOneAndUpdate(
    { whatsappNumber },
    { codeHash: sha(code), expiresAt: new Date(Date.now() + OTP_MINUTES * 60_000), attempts: 0, lastSentAt: new Date() },
    { upsert: true }
  );
  try {
    await sender(whatsappNumber, code);
  } catch (error) {
    await DevoteeOtp.deleteOne({ whatsappNumber }); // nothing was delivered: no code to keep, no minute to wait
    throw error;
  }
  return { minutes: OTP_MINUTES };
}

async function verifyCode(phoneInput, code) {
  const whatsappNumber = normalizePhone(phoneInput);
  const typed = String(code ?? '').trim();
  if (!whatsappNumber || !typed) throw ApiError.badRequest('Enter your number and the code');

  const row = await DevoteeOtp.findOne({ whatsappNumber });
  if (!row || row.expiresAt.getTime() < Date.now()) throw ApiError.badRequest('The code has expired. Please request a new one.');
  const ok = crypto.timingSafeEqual(Buffer.from(sha(typed)), Buffer.from(row.codeHash));
  if (!ok) {
    if (row.attempts + 1 >= MAX_ATTEMPTS) {
      await row.deleteOne();
      throw ApiError.badRequest('Too many wrong codes. Please request a new one.');
    }
    await DevoteeOtp.updateOne({ _id: row._id }, { $inc: { attempts: 1 } });
    throw ApiError.badRequest('That code is not right.');
  }
  await row.deleteOne();

  const devotee = await Devotee.findOneAndUpdate({ whatsappNumber, active: true }, { lastLoginAt: new Date() }, { new: true });
  if (!devotee) throw ApiError.forbidden('This number is not on the devotee list.');
  const token = jwt.sign({ id: devotee.id, kind: 'devotee' }, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN });
  return { token, devotee: { id: devotee.id, name: devotee.name, role: VIEWER_ROLE } };
}

module.exports = { list, add, addMany, update, remove, requestCode, verifyCode, setCodeSender };
