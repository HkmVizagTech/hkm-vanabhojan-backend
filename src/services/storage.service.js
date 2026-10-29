const crypto = require('node:crypto');
const { S3Client, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { GetObjectCommand } = require('@aws-sdk/client-s3');
const sharp = require('sharp');
const { env, integrations } = require('../config/env');
const ApiError = require('../utils/ApiError');

const ID_CARD_URL_TTL = 60 * 60; // seconds a signed ID-card link stays valid

let client = null;
function s3() {
  if (!integrations.storage) throw ApiError.unavailable('File storage is not configured');
  client ||= new S3Client({
    region: 'auto',
    endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY },
  });
  return client;
}

const idBucket = () => env.R2_ID_BUCKET || env.R2_BUCKET;
const randomId = () => `${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

const put = (bucket, key, body, contentType) =>
  s3().send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType, CacheControl: 'public, max-age=31536000, immutable' }));

/** Resizes to at most 800x600 and re-encodes as JPEG (keeps uploads small), then stores it. */
async function uploadIdCard(file) {
  const body = await sharp(file.buffer).rotate().resize(800, 600, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer();
  const key = `student-id-cards/student_${randomId()}.jpg`;
  await put(idBucket(), key, body, 'image/jpeg');
  return { key };
}

/** Stores a certificate PDF and returns the public link that is sent over WhatsApp. */
async function uploadCertificate(buffer, documentId) {
  if (!integrations.publicFiles) throw ApiError.unavailable('R2_PUBLIC_URL is not configured');
  const key = `certificates/${documentId}.pdf`;
  await put(env.R2_BUCKET, key, buffer, 'application/pdf');
  return { key, url: `${env.R2_PUBLIC_URL.replace(/\/$/, '')}/${key}`, size: buffer.length };
}

/** Stores an entry-pass QR image and returns its public link (WhatsApp fetches images by URL). */
async function uploadQrPass(buffer, token) {
  if (!integrations.publicFiles) throw ApiError.unavailable('R2_PUBLIC_URL is not configured');
  const key = `qr-passes/${token}.png`;
  await put(env.R2_BUCKET, key, buffer, 'image/png');
  return { key, url: `${env.R2_PUBLIC_URL.replace(/\/$/, '')}/${key}` };
}

/** Temporary link for viewing an ID card. The bucket itself can stay private. */
const signedIdCardUrl = key =>
  getSignedUrl(s3(), new GetObjectCommand({ Bucket: idBucket(), Key: key }), { expiresIn: ID_CARD_URL_TTL });

const removeObject = (bucket, key) => s3().send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));

module.exports = { uploadIdCard, uploadCertificate, uploadQrPass, signedIdCardUrl, removeObject };
