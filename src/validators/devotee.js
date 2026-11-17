const { z } = require('zod');
const { phone } = require('./common');

const name = z.string().trim().min(1, 'Name is required').max(100);

const addBody = z.object({ name, whatsappNumber: phone });

/** Rows from a pasted list or a CSV: the phone is checked one by one by the service, so one bad row never rejects the rest. */
const bulkBody = z.object({
  rows: z.array(z.object({ name: z.string().max(100).optional(), phone: z.string().max(40).optional() })).min(1, 'Nothing to add').max(2000),
});

const updateBody = z
  .object({ name, active: z.boolean() })
  .partial()
  .refine(v => Object.keys(v).length > 0, 'Nothing to update');

const requestCodeBody = z.object({ phone: z.string().min(1, 'Enter your WhatsApp number') });
const verifyCodeBody = z.object({ phone: z.string().min(1), otp: z.string().trim().min(1, 'Enter the code') });

module.exports = { addBody, bulkBody, updateBody, requestCodeBody, verifyCodeBody };
