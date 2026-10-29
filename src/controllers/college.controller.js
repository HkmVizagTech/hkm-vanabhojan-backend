const College = require('../models/College');
const ApiError = require('../utils/ApiError');

const COLLATION = { locale: 'en', strength: 2 };

exports.list = async (_req, res) => res.json(await College.find().sort({ name: 1 }).collation(COLLATION));

exports.create = async (req, res) => {
  const college = await College.create({ name: req.body.name });
  res.status(201).json(college);
};

/** Adds many colleges at once; names that already exist (ignoring case) or repeat in the list are skipped. */
exports.bulkCreate = async (req, res) => {
  const unique = new Map();
  for (const name of req.body.names) if (!unique.has(name.toLowerCase())) unique.set(name.toLowerCase(), name);
  const names = [...unique.values()];

  const existing = await College.find({ name: { $in: names } }).collation(COLLATION).select('name');
  const taken = new Set(existing.map(c => c.name.toLowerCase()));
  const fresh = names.filter(n => !taken.has(n.toLowerCase()));

  if (fresh.length) await College.insertMany(fresh.map(name => ({ name })), { ordered: false });
  res.status(201).json({ created: fresh.length, skipped: req.body.names.length - fresh.length });
};

exports.update = async (req, res) => {
  const college = await College.findByIdAndUpdate(req.params.id, { name: req.body.name }, { new: true, runValidators: true });
  if (!college) throw ApiError.notFound('College not found');
  res.json(college);
};

exports.remove = async (req, res) => {
  const college = await College.findByIdAndDelete(req.params.id);
  if (!college) throw ApiError.notFound('College not found');
  res.json({ message: 'College deleted' });
};
