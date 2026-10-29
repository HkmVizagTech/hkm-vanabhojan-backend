const { z } = require('zod');

const text = max => z.string().trim().max(max);

const eventBody = z
  .object({
    name: text(120).min(1, 'Event name is required'),
    date: z.coerce.date({ error: 'Event date is required' }),
    venue: z
      .object({ name: text(200).default(''), address: text(300).default(''), mapsUrl: text(500).default('') })
      .default({ name: '', address: '', mapsUrl: '' }),
    fees: z.object({
      college: z.coerce.number({ error: 'Student fee is required' }).positive('Student fee must be more than 0'),
      working: z.coerce.number({ error: 'Fee for others is required' }).positive('Fee for others must be more than 0'),
    }),
    ageMin: z.coerce.number().int().min(0).max(100).default(16),
    ageMax: z.coerce.number().int().min(0).max(100).default(31),
    registrationOpen: z.boolean().default(false),
  })
  .refine(v => v.ageMin <= v.ageMax, { message: 'Minimum age cannot be above maximum age', path: ['ageMin'] });

const followupQuery = z.object({
  from: z.string().regex(/^[a-f\d]{24}$/i, 'Choose the event to follow up from'),
  to: z.string().regex(/^[a-f\d]{24}$/i, 'Choose the event to invite them to'),
  audience: z.enum(['attended', 'registered', 'no_show']).default('attended'),
});

const followupSendBody = followupQuery.extend({ audience: z.enum(['attended', 'registered', 'no_show']).default('attended') });

module.exports = { eventBody, followupQuery, followupSendBody };
