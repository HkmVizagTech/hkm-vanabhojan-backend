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

  FLAXXA_API_TOKEN: z.string().default(''),
  FLAXXA_BASE_URL: z.string().default('https://wapi.flaxxa.com/api/v1'),
  // Template names Meta has approved ("all" or a comma-separated list); see src/config/whatsapp.js.
  WA_APPROVED_TEMPLATES: z.string().default('all'),
  // Name of the approved follow-up template (vb_followup1 once approved). Empty keeps follow-ups switched off.
  WA_TEMPLATE_FOLLOWUP: z.string().default(''),

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
  whatsapp: Boolean(env.FLAXXA_API_TOKEN),
  storage: Boolean(env.R2_ACCOUNT_ID && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY && env.R2_BUCKET),
  // Certificates are sent to WhatsApp as links, so they need a publicly reachable URL.
  publicFiles: Boolean(env.R2_PUBLIC_URL),
});

module.exports = { env, integrations, isProd: env.NODE_ENV === 'production', isTest: env.NODE_ENV === 'test' };
