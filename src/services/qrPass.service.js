const QRCode = require('qrcode');
const { env, integrations } = require('../config/env');
const storage = require('./storage.service');
const gupshup = require('./gupshup');
const ApiError = require('../utils/ApiError');

const png = token => QRCode.toBuffer(token, { width: 512, margin: 2, errorCorrectionLevel: 'M' });

const dateLabel = date =>
  new Date(date).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

/**
 * Sends the person's entry QR as an image over WhatsApp (approved IMAGE template).
 * The picture is stored in R2 so WhatsApp can fetch it by link.
 */
async function sendPass({ candidate, event }) {
  if (!integrations.gupshup) throw ApiError.unavailable('WhatsApp is not configured');
  if (!integrations.storage || !integrations.publicFiles) throw ApiError.unavailable('File storage is not configured');

  const image = await storage.uploadQrPass(await png(candidate.attendanceToken), candidate.attendanceToken);
  const response = await gupshup.postForm('/wa/api/v1/template/msg', {
    source: env.GUPSHUP_SOURCE,
    destination: candidate.whatsappNumber,
    'src.name': env.GUPSHUP_APP_NAME,
    template: {
      id: env.WA_TEMPLATE_QR_PASS,
      params: [
        candidate.name,
        candidate.collegeOrWorking === 'College' ? 'Student' : 'Participant',
        event.name,
        dateLabel(event.date),
        [event.venue?.name, event.venue?.address].filter(Boolean).join(', ') || 'the venue',
      ],
    },
    message: { type: 'image', image: { link: image.url } },
  });
  if (response.status < 200 || response.status >= 300) {
    throw new ApiError(502, `WhatsApp provider error (${response.status})`);
  }
  return response.data;
}

module.exports = { sendPass, png };
