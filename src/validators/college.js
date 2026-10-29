const { z } = require('zod');

const collegeBody = z.object({ name: z.string().trim().min(1, 'College name is required').max(200) });

const bulkBody = z.object({
  names: z.array(z.string().trim().min(1).max(200)).min(1, 'Add at least one college').max(500, 'Add at most 500 at a time'),
});

module.exports = { collegeBody, bulkBody };
