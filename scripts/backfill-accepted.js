/* One-off: mark paid registrations that never need an ID check (working professionals, cash-desk students) as Accepted.
 * Safe to run more than once. Usage: node scripts/backfill-accepted.js */
require('dotenv').config();
const mongoose = require('mongoose');
const Candidate = require('../src/models/Candidate');

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const filter = {
    paymentStatus: 'Paid',
    adminAction: null,
    $or: [{ collegeOrWorking: 'Working' }, { paymentMethod: 'Cash' }],
  };
  const result = await Candidate.updateMany(filter, { $set: { adminAction: 'Accepted', adminActionDate: new Date() } });
  console.log(`Marked ${result.modifiedCount} registration(s) as Accepted.`);
  await mongoose.disconnect();
})().catch(error => {
  console.error(error.message);
  process.exit(1);
});
