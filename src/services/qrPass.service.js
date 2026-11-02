const QRCode = require('qrcode');
const { integrations } = require('../config/env');
const { TEMPLATES } = require('../config/whatsapp');
const storage = require('./storage.service');
const whatsapp = require('./whatsapp.service');
const ApiError = require('../utils/ApiError');
const { dateLabel } = require('../utils/dates');

const png = token => QRCode.toBuffer(token, { width: 512, margin: 2, errorCorrectionLevel: 'M' });


/**
 * Sends the person's entry QR as an image over WhatsApp (approved IMAGE template).
 * The picture is stored in R2 so WhatsApp can fetch it by link.
 */
async function sendPass({ candidate, event }) {
  if (!integrations.whatsapp) throw ApiError.unavailable('WhatsApp is not configured');
  if (!integrations.storage || !integrations.publicFiles) throw ApiError.unavailable('File storage is not configured');

  const image = await storage.uploadQrPass(await png(candidate.attendanceToken), candidate.attendanceToken);
  const result = await whatsapp.send({
    candidate,
    kind: 'qr_pass',
    template: TEMPLATES.QR_PASS,
    header: { type: 'image', link: image.url },
    params: [
      whatsapp.name(candidate),
      candidate.collegeOrWorking === 'College' ? 'Student' : 'Participant',
      event.name,
      dateLabel(event.date),
      [event.venue?.name, event.venue?.address].filter(Boolean).join(', ') || 'the venue',
    ],
  });
  if (!result.ok) throw new ApiError(502, result.error);
  return result.data;
}

module.exports = { sendPass, png };
