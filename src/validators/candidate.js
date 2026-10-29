const { z } = require('zod');
const { CANDIDATE_TYPES, PAYMENT_STATUS } = require('../config/constants');
const { phone } = require('./common');

const text = max => z.string().trim().max(max);
const optionalText = max => text(max).optional().default('');

const base = {
  name: text(100).min(1, 'Name is required'),
  whatsappNumber: phone,
  email: z.string().trim().toLowerCase().pipe(z.email('Enter a valid email')),
  gender: z.enum(['Male', 'Female', 'Other'], { error: 'Please select gender' }),
  dob: z.coerce.date({ error: 'Date of birth is required' }).refine(d => d <= new Date(), 'Date of birth cannot be in the future'),
  collegeOrWorking: z.enum(Object.values(CANDIDATE_TYPES), { error: 'Please select one option' }),
  howDidYouKnow: text(100).min(1, 'Please select how you came to know about this fest'),
  college: optionalText(200),
  course: optionalText(100),
  year: optionalText(10),
  companyName: optionalText(200),
};

/** Students need college/course/year; everyone else needs a company. */
const withRegistrationRules = schema =>
  schema.superRefine((v, ctx) => {
    const need = (field, message) => ctx.addIssue({ code: 'custom', path: [field], message });
    if (v.collegeOrWorking === CANDIDATE_TYPES.COLLEGE) {
      if (!v.college) need('college', 'College name is required');
      if (!v.course) need('course', 'Course is required');
      if (!v.year) need('year', 'Year is required');
    } else if (!v.companyName) {
      need('companyName', 'Company name is required');
    }
  });

/** Body of a registration. The price is derived from collegeOrWorking, never taken from the client. */
const registration = withRegistrationRules(z.object(base));

const blankToUndefined = v => (typeof v === 'string' && v.trim() === '' ? undefined : v);

/**
 * Walk-in registered at the cash desk. Only name, WhatsApp number, gender and the type (student or
 * other, which sets the fee) are required: someone standing at a desk should not need a full form.
 * `checkIn` also marks them as arrived.
 */
const cashRegistration = z.object({
  name: base.name,
  whatsappNumber: base.whatsappNumber,
  gender: base.gender,
  collegeOrWorking: base.collegeOrWorking,
  email: z.preprocess(blankToUndefined, z.string().trim().toLowerCase().pipe(z.email('Enter a valid email')).optional()),
  dob: z.preprocess(blankToUndefined, z.coerce.date().max(new Date(), 'Date of birth cannot be in the future').optional()),
  howDidYouKnow: text(100).optional().default('Walk-in'),
  college: optionalText(200),
  course: optionalText(100),
  year: optionalText(10),
  companyName: optionalText(200),
  checkIn: z.boolean().default(false),
});

const createOrderBody = z.object({
  // `amount` is accepted for backwards compatibility with older clients and ignored.
  amount: z.coerce.number().optional(),
  formData: registration,
});

/** multipart: formData arrives as a JSON string next to the file. */
const createOrderWithFileBody = z.object({
  amount: z.coerce.number().optional(),
  formData: z
    .string()
    .transform((raw, ctx) => {
      try {
        return JSON.parse(raw);
      } catch {
        ctx.addIssue({ code: 'custom', message: 'formData must be valid JSON' });
        return z.NEVER;
      }
    })
    .pipe(registration),
});

/** Fields an admin may edit by hand. Payment/attendance state is changed only through dedicated flows. */
const adminUpdate = z
  .object({
    name: base.name,
    email: base.email,
    whatsappNumber: base.whatsappNumber,
    gender: base.gender,
    dob: base.dob,
    howDidYouKnow: base.howDidYouKnow,
    collegeOrWorking: base.collegeOrWorking,
    college: z.string().trim().max(200),
    course: z.string().trim().max(100),
    year: z.string().trim().max(10),
    companyName: z.string().trim().max(200),
  })
  .partial()
  .refine(v => Object.keys(v).length > 0, 'Nothing to update');

const paymentCallback = z.object({
  razorpay_order_id: z.string().min(1),
  razorpay_payment_id: z.string().min(1),
  razorpay_signature: z.string().min(1),
});

const immediateVerify = z
  .object({ orderId: z.string().optional(), paymentId: z.string().optional() })
  .refine(v => v.orderId || v.paymentId, 'Either orderId or paymentId is required');

// `event` is an event id, or "all". Left out = the current event.
const eventFilter = z.union([z.literal('all'), z.string().regex(/^[a-f\d]{24}$/i, 'Invalid event')]).optional();

const listQuery = z.object({
  paymentStatus: z.enum(Object.values(PAYMENT_STATUS)).optional(),
  event: eventFilter,
});

const eventQuery = z.object({ event: eventFilter });
const attendanceReportQuery = z.object({
  event: eventFilter,
  status: z.enum(['present', 'absent']).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

const phoneBody = z.object({ whatsappNumber: z.string().min(1, 'WhatsApp number is required') });
const scanBody = z.object({ token: z.string().trim().min(1, 'QR token is required') });
const candidateIdBody = z.object({ candidateId: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid candidateId') });
const bulkCertificatesBody = z.object({
  candidateIds: z.array(z.string().regex(/^[a-f\d]{24}$/i)).optional(),
});
const deleteByNameBody = z.object({ name: z.string().trim().min(2, 'Name is required') });
const reminderBody = z.object({ time: z.string().trim().min(1).max(30).default('4 PM') });

module.exports = {
  registration,
  cashRegistration,
  createOrderBody,
  createOrderWithFileBody,
  adminUpdate,
  paymentCallback,
  immediateVerify,
  listQuery,
  eventQuery,
  attendanceReportQuery,
  phoneBody,
  scanBody,
  candidateIdBody,
  bulkCertificatesBody,
  deleteByNameBody,
  reminderBody,
};
