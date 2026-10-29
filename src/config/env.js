const path = require('node:path');
const { z } = require('zod');

require('dotenv').config({ path: path.join(__dirname, '../../.env'), quiet: true });

const bool = z
  .enum(['true', 'false'])
  .transform(v => v === 'true');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3300),
  LOG_LEVEL: z.string().default('info'),

  MONGO_URI: z.string().min(1, 'MONGO_URI is required'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  // Comma separated list of allowed browser origins. Empty = allow any origin.
  CORS_ORIGINS: z.string().default(''),

  RAZORPAY_KEY_ID: z.string().default(''),
  RAZORPAY_KEY_SECRET: z.string().default(''),
  RAZORPAY_WEBHOOK_SECRET: z.string().default(''),

  GUPSHUP_API_KEY: z.string().default(''),
  GUPSHUP_SOURCE: z.string().default(''),
  GUPSHUP_APP_NAME: z.string().default(''),
  // Template ids are not secrets. Defaults are the templates currently approved for the festival.
  WA_TEMPLATE_REGISTRATION_STUDENT: z.string().default('66ab1b5c-f2df-4fd7-b8dc-1ea139a1f35e'),
  WA_TEMPLATE_REGISTRATION_WORKING: z.string().default('62641f1e-aad7-4c96-933d-b0de01d2ee4c'),
  WA_TEMPLATE_ACCEPT_MALE: z.string().default('4406a55e-cecd-4470-85bc-af1669bae7c5'),
  WA_TEMPLATE_ACCEPT_FEMALE: z.string().default('50efca60-006f-46aa-8546-319c02eea04c'),
  WA_TEMPLATE_REJECT: z.string().default('0136b065-b9d0-48cc-b4b3-3b0b912cef53'),
  WA_TEMPLATE_REMINDER: z.string().default('ce707c05-54ef-4e80-b0fd-c0f9885288f6'),
  WA_TEMPLATE_CERTIFICATE: z.string().default('1e5b2dd0-3ee7-4d8d-bd41-9a80073b1399'),
  WA_TEMPLATE_CERTIFICATE_TEXT: z.string().default(''),
  // Invitation to last year's attendees. Must be an approved template with two variables: {{1}} name, {{2}} event name.
  WA_TEMPLATE_FOLLOWUP: z.string().default(''),
  // Approved IMAGE template for entry passes. Variables: {{1}} name, {{2}} pass type, {{3}} event, {{4}} date, {{5}} venue.
  WA_TEMPLATE_QR_PASS: z.string().default('51ca81b1-4e36-44e6-8678-b64a163acd5e'),

  // Cloudflare R2 (S3-compatible object storage) for student ID cards and certificates.
  R2_ACCOUNT_ID: z.string().default(''),
  R2_ACCESS_KEY_ID: z.string().default(''),
  R2_SECRET_ACCESS_KEY: z.string().default(''),
  R2_BUCKET: z.string().default(''),
  // Optional second (private) bucket for ID cards; defaults to R2_BUCKET.
  R2_ID_BUCKET: z.string().default(''),
  // Public base URL of the certificates bucket: the r2.dev URL or a custom domain, no trailing slash.
  R2_PUBLIC_URL: z.string().default(''),

  ENABLE_PAYMENT_CRON: bool.default(true),
  PAYMENT_CRON_SCHEDULE: z.string().default('*/2 * * * *'),
  PAYMENT_CRON_BATCH: z.coerce.number().int().positive().default(50),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  const lines = parsed.error.issues.map(i => `  - ${i.path.join('.')}: ${i.message}`);
  // eslint-disable-next-line no-console
  console.error(`Invalid environment configuration:\n${lines.join('\n')}`);
  process.exit(1);
}

const env = Object.freeze(parsed.data);

/** Integrations that are optional at boot but required for specific features. */
const integrations = Object.freeze({
  razorpay: Boolean(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET),
  razorpayWebhook: Boolean(env.RAZORPAY_WEBHOOK_SECRET),
  gupshup: Boolean(env.GUPSHUP_API_KEY && env.GUPSHUP_SOURCE),
  storage: Boolean(env.R2_ACCOUNT_ID && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY && env.R2_BUCKET),
  // Certificates are sent to WhatsApp as links, so they need a publicly reachable URL.
  publicFiles: Boolean(env.R2_PUBLIC_URL),
});

module.exports = { env, integrations, isProd: env.NODE_ENV === 'production', isTest: env.NODE_ENV === 'test' };
