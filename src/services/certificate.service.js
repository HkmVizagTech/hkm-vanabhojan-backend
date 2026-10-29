const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const axios = require('axios');
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const fontkit = require('@pdf-lib/fontkit');
const Candidate = require('../models/Candidate');
const storage = require('./storage.service');
const { env, integrations } = require('../config/env');
const { PAYMENT_STATUS } = require('../config/constants');
const ApiError = require('../utils/ApiError');
const { normalizePhone } = require('../utils/phone');
const logger = require('../utils/logger');
const gupshup = require('./gupshup');

const FONT_SIZE = 36;
const BULK_DELAY_MS = 3000;
const ASSETS = path.join(__dirname, '..');
const TEMPLATE_PDF = path.join(ASSETS, 'certifications/certificate.pdf');
const FONT_BOLD = path.join(ASSETS, 'fonts/Demo_Fonts/Fontspring-DEMO-theseasons-bd.otf');
const FONT_REGULAR = path.join(ASSETS, 'fonts/Demo_Fonts/Fontspring-DEMO-theseasons-reg.otf');
const TMP_DIR = path.join(os.tmpdir(), 'vanabhojanam-certificates');

const ELIGIBLE = { attendance: true, paymentStatus: PAYMENT_STATUS.PAID };
const exists = file => fs.access(file).then(() => true, () => false);

function generateDocumentId(name) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const clean = String(name || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase().slice(0, 10) || 'user';
  return `CERT-${clean}-${stamp}-${crypto.randomBytes(3).toString('hex')}`;
}

/** Writes the participant's name onto the certificate template and returns the PDF bytes. */
async function renderCertificate(name) {
  if (!(await exists(TEMPLATE_PDF))) throw new Error(`Certificate template not found at ${TEMPLATE_PDF}`);
  const pdf = await PDFDocument.load(await fs.readFile(TEMPLATE_PDF));
  pdf.registerFontkit(fontkit);

  const fontFile = (await exists(FONT_BOLD)) ? FONT_BOLD : (await exists(FONT_REGULAR)) ? FONT_REGULAR : null;
  const font = fontFile ? await pdf.embedFont(await fs.readFile(fontFile)) : await pdf.embedFont(StandardFonts.HelveticaBold);

  const page = pdf.getPage(0);
  const label = String(name || '').trim().replace(/\s+/g, ' ') || 'Participant';
  const { width, height } = page.getSize();
  page.drawText(label, { x: (width - font.widthOfTextAtSize(label, FONT_SIZE)) / 2, y: height * 0.52, size: FONT_SIZE, font, color: rgb(0, 0, 0) });
  return pdf.save();
}

const parseDelivery = response => {
  const ok = response.status >= 200 && response.status < 300;
  return ok
    ? { ok, messageId: response.data?.messageId || 'unknown', status: response.data?.status || 'submitted' }
    : { ok, code: response.status, error: typeof response.data === 'string' ? response.data : JSON.stringify(response.data || {}) };
};

/** WhatsApp document template, falling back to the legacy endpoint and then to a text template with the link. */
async function deliver({ destination, name, url, filename }) {
  const common = { channel: 'whatsapp', source: env.GUPSHUP_SOURCE, destination, 'src.name': env.GUPSHUP_APP_NAME };
  const template = { id: env.WA_TEMPLATE_CERTIFICATE, params: [name] };

  let result = parseDelivery(
    await gupshup.postForm('/wa/api/v1/template/msg', { ...common, template, message: { document: { link: url, filename }, type: 'document' } })
  );
  if (!result.ok && result.code >= 400 && result.code < 500) {
    result = parseDelivery(
      await gupshup.postForm('/sm/api/v1/template/msg', { ...common, template, message: { type: 'document', url, filename } })
    );
  }
  if (!result.ok && env.WA_TEMPLATE_CERTIFICATE_TEXT) {
    result = parseDelivery(
      await gupshup.postForm('/wa/api/v1/template/msg', { ...common, template: { id: env.WA_TEMPLATE_CERTIFICATE_TEXT, params: [name, url] } })
    );
  }
  if (!result.ok) throw new ApiError(502, `Gupshup ${result.code}: ${result.error}`);
  return result;
}

/** Generate, upload, send and record one certificate. Returns { documentId, file, whatsapp }. */
async function issue(candidate, issuedBy) {
  if (!integrations.storage || !integrations.publicFiles) throw ApiError.unavailable('File storage is not configured');
  const destination = normalizePhone(candidate.whatsappNumber);
  if (!destination) throw ApiError.badRequest(`Invalid WhatsApp number: ${candidate.whatsappNumber}`);

  const documentId = generateDocumentId(candidate.name);

  const pdf = Buffer.from(await renderCertificate(candidate.name));
  const file = await storage.uploadCertificate(pdf, documentId);

  const reachable = await axios.head(file.url, { timeout: 10000, validateStatus: () => true });
  if (reachable.status >= 400) throw new Error(`Certificate URL not reachable (status ${reachable.status})`);

  const whatsapp = await deliver({
    destination,
    name: candidate.name || 'Participant',
    url: file.url,
    filename: `KP-Certificate-${documentId}.pdf`,
  });

  await Candidate.findByIdAndUpdate(candidate._id, {
    $set: {
      certificateSent: true,
      certificateSentDate: new Date(),
      certificateSentBy: issuedBy,
      certificateDocumentId: documentId,
      certificateUrl: file.url,
      certificateStorageKey: file.key,
      certificateFileName: `${documentId}.pdf`,
      certificateFileSize: file.size,
      certificateStorageMethod: 'r2',
      certificateWhatsAppMessageId: whatsapp.messageId,
      certificateWhatsAppStatus: whatsapp.status,
      certificateDeliveryMethod: 'template_document_link',
    },
  });
  logger.info({ candidateId: candidate._id, documentId }, 'Certificate issued');
  return { documentId, file, whatsapp };
}

function assertEligible(candidate) {
  if (!candidate.attendance || candidate.paymentStatus !== PAYMENT_STATUS.PAID) {
    throw ApiError.badRequest(`Candidate not eligible: attendance=${candidate.attendance}, payment=${candidate.paymentStatus}`);
  }
}

async function listEligible() {
  const candidates = await Candidate.find(ELIGIBLE)
    .select('name email whatsappNumber college course gender attendanceDate certificateSent certificateSentDate certificateSentBy certificateDocumentId certificateUrl certificateFileName certificateFileSize certificateDeliveryMethod certificateWhatsAppStatus')
    .sort({ attendanceDate: -1 });
  const sent = candidates.filter(c => c.certificateSent).length;
  return {
    status: 'success',
    summary: {
      total: candidates.length,
      certificatesSent: sent,
      pendingCertificates: candidates.length - sent,
      withStoredFiles: candidates.filter(c => c.certificateUrl).length,
    },
    candidates,
  };
}

async function sendOne(candidate, issuedBy) {
  assertEligible(candidate);
  if (candidate.certificateSent) return { status: 'already-sent', candidate };
  return { status: 'success', candidate, ...(await issue(candidate, issuedBy)) };
}

async function resend(candidate, issuedBy) {
  assertEligible(candidate);
  const previous = { documentId: candidate.certificateDocumentId, url: candidate.certificateUrl };
  return { previous, ...(await issue(candidate, issuedBy)) };
}

/** Sends to every eligible candidate (or the given ids), one at a time with a pause between sends. */
async function sendBulk({ candidateIds, issuedBy }) {
  const query = { ...ELIGIBLE, ...(candidateIds?.length ? { _id: { $in: candidateIds } } : {}) };
  const candidates = await Candidate.find(query);
  if (!candidates.length) throw ApiError.notFound('No eligible candidates found');

  const counts = { successful: 0, failed: 0, alreadySent: 0 };
  const results = [];
  for (const [index, candidate] of candidates.entries()) {
    const base = { candidateId: candidate._id, name: candidate.name, whatsappNumber: candidate.whatsappNumber };
    if (candidate.certificateSent) {
      counts.alreadySent += 1;
      results.push({ ...base, status: 'already-sent', sentDate: candidate.certificateSentDate, documentId: candidate.certificateDocumentId });
      continue;
    }
    try {
      const issued = await issue(candidate, issuedBy);
      counts.successful += 1;
      results.push({ ...base, status: 'success', documentId: issued.documentId, url: issued.file.url, whatsappMessageId: issued.whatsapp.messageId });
    } catch (error) {
      counts.failed += 1;
      results.push({ ...base, status: 'failed', error: error.message });
    }
    if (index < candidates.length - 1) await new Promise(resolve => setTimeout(resolve, BULK_DELAY_MS));
  }

  return {
    status: 'completed',
    message: `Certificate processing completed. Success: ${counts.successful}, Failed: ${counts.failed}, Already sent: ${counts.alreadySent}`,
    summary: { total: candidates.length, ...counts, successRate: `${((counts.successful / candidates.length) * 100).toFixed(2)}%` },
    results,
  };
}

/** Renders a certificate to a temp file without sending anything. */
async function generateOnly(candidate) {
  assertEligible(candidate);
  const documentId = generateDocumentId(candidate.name);
  await fs.mkdir(TMP_DIR, { recursive: true });
  const outputPath = path.join(TMP_DIR, `${documentId}.pdf`);
  const bytes = await renderCertificate(candidate.name);
  await fs.writeFile(outputPath, bytes);
  return { documentId, fileName: `${documentId}.pdf`, fileSize: bytes.length, outputPath };
}

/** Public certificate verification: name and file only, no contact details. */
async function findByDocumentId(documentId) {
  const c = await Candidate.findOne({ certificateDocumentId: documentId });
  if (!c) throw ApiError.notFound('Certificate not found in database');
  return {
    documentId,
    name: c.name,
    college: c.college,
    course: c.course,
    sentDate: c.certificateSentDate,
    url: c.certificateUrl,
    fileName: c.certificateFileName,
  };
}

async function statistics() {
  const [totalEligible, totalSent, storedCount, pdfAttachments, textMessages, recent] = await Promise.all([
    Candidate.countDocuments(ELIGIBLE),
    Candidate.countDocuments({ ...ELIGIBLE, certificateSent: true }),
    Candidate.countDocuments({ certificateUrl: { $exists: true, $ne: null } }),
    Candidate.countDocuments({ certificateDeliveryMethod: 'pdf_attachment' }),
    Candidate.countDocuments({ certificateDeliveryMethod: 'text_message' }),
    Candidate.find({ certificateSent: true })
      .select('name certificateSentDate certificateDocumentId certificateUrl certificateSentBy certificateDeliveryMethod certificateWhatsAppStatus')
      .sort({ certificateSentDate: -1 })
      .limit(10),
  ]);
  return {
    overview: {
      totalEligible,
      totalSent,
      totalPending: totalEligible - totalSent,
      completionRate: totalEligible ? `${((totalSent / totalEligible) * 100).toFixed(2)}%` : '0%',
    },
    storage: { storedCount, storageMethod: 'r2', folder: 'certificates' },
    delivery: { pdfAttachments, textMessages, totalDelivered: pdfAttachments + textMessages },
    recent,
  };
}

async function health(dbReady) {
  const templateOk = await exists(TEMPLATE_PDF);
  const parts = {
    storage: integrations.storage && integrations.publicFiles ? 'healthy' : 'unhealthy',
    whatsapp: integrations.gupshup ? 'healthy' : 'unhealthy',
    database: dbReady ? 'healthy' : 'unhealthy',
    template: templateOk ? 'healthy' : 'unhealthy',
  };
  return { overall: Object.values(parts).every(v => v === 'healthy') ? 'healthy' : 'degraded', ...parts };
}

module.exports = { listEligible, sendOne, resend, sendBulk, generateOnly, findByDocumentId, statistics, health, generateDocumentId };
