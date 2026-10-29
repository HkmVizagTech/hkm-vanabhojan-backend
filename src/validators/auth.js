const { z } = require('zod');
const { ROLES } = require('../config/constants');

const email = z.string().trim().toLowerCase().pipe(z.email('Enter a valid email'));

const login = z.object({ email, password: z.string().min(1, 'Password is required') });

const register = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100),
  email,
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
  role: z.enum(Object.values(ROLES)).optional(),
  canCollectCash: z.boolean().optional(),
});

const updateUser = z
  .object({ active: z.boolean(), role: z.enum(Object.values(ROLES)), canCollectCash: z.boolean() })
  .partial()
  .refine(v => Object.keys(v).length > 0, 'Nothing to update');

module.exports = { login, register, updateUser };
