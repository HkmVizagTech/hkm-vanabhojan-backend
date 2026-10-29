/* Usage: npm run create-admin -- "Name" email@example.com 'password' [--super]
 * (or set ADMIN_NAME/ADMIN_EMAIL/ADMIN_PASSWORD). --super makes the owner account that is hidden from staff lists. */
const bcrypt = require('bcryptjs');
const { connectDb, disconnectDb } = require('../src/config/db');
const User = require('../src/models/User');
const schemas = require('../src/validators/auth');

(async () => {
  const args = process.argv.slice(2).filter(a => a !== '--super');
  const makeSuper = process.argv.includes('--super');
  const [name = process.env.ADMIN_NAME, email = process.env.ADMIN_EMAIL, password = process.env.ADMIN_PASSWORD] = args;
  const input = schemas.register.parse({ name, email, password });
  await connectDb();
  const existing = await User.findOne({ email: input.email });
  const hash = await bcrypt.hash(input.password, 12);
  if (existing) {
    Object.assign(existing, { password: hash, role: 'admin', name: input.name, active: true, ...(makeSuper ? { isSuperAdmin: true } : {}) });
    await existing.save();
    console.log(`Updated existing user ${input.email} (role: admin)`);
  } else {
    await User.create({ name: input.name, email: input.email, password: hash, role: 'admin', isSuperAdmin: makeSuper });
    console.log(`Created ${makeSuper ? 'super admin' : 'admin'} ${input.email}`);
  }
  await disconnectDb();
})().catch(error => {
  console.error(error.message);
  process.exit(1);
});
