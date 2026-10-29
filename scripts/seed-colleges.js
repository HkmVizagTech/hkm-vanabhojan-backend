/* Adds the colleges of Visakhapatnam to the dropdown. Safe to run again: existing names (any case) are skipped.
 * Usage: npm run seed-colleges            (add the built-in list)
 *        npm run seed-colleges -- file.txt (add names from a text file, one per line) */
const fs = require('node:fs');
const { connectDb, disconnectDb } = require('../src/config/db');
const College = require('../src/models/College');

const VIZAG_COLLEGES = [
  'Andhra University',
  'Andhra University College of Engineering',
  'Andhra University College of Pharmaceutical Sciences',
  'Andhra Medical College',
  'GITAM (Deemed to be University)',
  'GITAM School of Technology',
  'GITAM Institute of Medical Sciences and Research',
  'Gayatri Vidya Parishad College of Engineering (GVPCE)',
  'Gayatri Vidya Parishad College for Degree and PG Courses',
  "Vignan's Institute of Information Technology (VIIT)",
  'Raghu Engineering College',
  'Raghu Institute of Technology',
  'Anil Neerukonda Institute of Technology and Sciences (ANITS)',
  'Sanketika Vidya Parishad Engineering College',
  'Pydah College of Engineering',
  'Avanthi Institute of Engineering and Technology',
  'Visakha Institute of Engineering and Technology',
  'Baba Institute of Technology and Sciences (BITS)',
  'Viswanadha Institute of Technology and Management',
  'Dr. Lankapalli Bullayya College',
  'Dr. V.S. Krishna Government Degree College',
  'Mrs. A.V.N. College',
  "St. Joseph's College for Women",
  'Visakha Government Degree College for Women',
  'Indian Institute of Management Visakhapatnam (IIM Visakhapatnam)',
  'Indian Institute of Petroleum and Energy (IIPE)',
];

(async () => {
  const file = process.argv[2];
  const wanted = file
    ? fs.readFileSync(file, 'utf8').split('\n').map(n => n.trim()).filter(Boolean)
    : VIZAG_COLLEGES;

  await connectDb();
  const existing = await College.find().collation({ locale: 'en', strength: 2 }).select('name');
  const taken = new Set(existing.map(c => c.name.toLowerCase()));
  const fresh = [...new Map(wanted.map(n => [n.toLowerCase(), n])).values()].filter(n => !taken.has(n.toLowerCase()));

  if (fresh.length) await College.insertMany(fresh.map(name => ({ name })), { ordered: false });
  console.log(`Added ${fresh.length} colleges, skipped ${wanted.length - fresh.length}. Total now: ${existing.length + fresh.length}`);
  await disconnectDb();
})().catch(error => {
  console.error(error.message);
  process.exit(1);
});
