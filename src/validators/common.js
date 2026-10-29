const { z } = require('zod');
const { normalizePhone } = require('../utils/phone');

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

/** Accepts 10 digits or 91 + 10 digits; outputs the stored 91XXXXXXXXXX form. */
const phone = z
  .string()
  .transform((value, ctx) => {
    const normalized = normalizePhone(value);
    if (!normalized) ctx.addIssue({ code: 'custom', message: 'Enter a valid 10-digit number' });
    return normalized;
  });

const idParam = key => z.object({ [key]: objectId });

module.exports = { objectId, phone, idParam };
