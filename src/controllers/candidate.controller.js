const candidates = require('../services/candidate.service');
const storage = require('../services/storage.service');
const { integrations } = require('../config/env');

/** Plain object for the API: the stored ID-card key becomes a short-lived signed `studentIdCardUrl`. */
async function present(candidate) {
  const { studentIdCardKey, ...data } = candidate.toObject ? candidate.toObject() : candidate;
  if (studentIdCardKey && integrations.storage) data.studentIdCardUrl = await storage.signedIdCardUrl(studentIdCardKey);
  return data;
}
const presentAll = list => Promise.all(list.map(present));

exports.list = async (req, res) => {
  const { paymentStatus, event } = req.valid.query;
  const filter = { ...(await candidates.eventFilter(event)), ...(paymentStatus ? { paymentStatus } : {}) };
  const all = await presentAll(await candidates.list(filter));
  res.json({ status: 'success', candidates: all, totalCandidates: all.length, message: 'All candidates fetched successfully (latest first)' });
};

exports.get = async (req, res) => {
  res.json({ status: 'success', candidate: await present(await candidates.findOrFail(req.params.id)) });
};

exports.update = async (req, res) => {
  const candidate = await present(await candidates.update(req.params.id, req.body));
  res.json({ status: 'success', message: 'Candidate updated successfully', candidate });
};

exports.remove = async (req, res) => {
  await candidates.remove(req.params.id);
  res.json({ status: 'success', message: 'Candidate deleted successfully' });
};

exports.removeByName = async (req, res) => {
  const deletedCount = await candidates.removeByName(req.body.name);
  res.json({ status: 'success', message: `Deleted ${deletedCount} candidates`, deletedCount });
};

exports.accept = async (req, res) => {
  const data = await present(await candidates.accept(req.params.candidateId));
  res.json({ status: 'success', message: 'Candidate accepted successfully', data });
};

exports.reject = async (req, res) => {
  const data = await present(await candidates.reject(req.params.candidateId));
  res.json({ status: 'success', message: 'Candidate rejected successfully', data });
};

exports.refund = async (req, res) => {
  const { candidate, refund } = await candidates.refund(req.params.candidateId);
  // `data` is the updated candidate: the admin UI merges it straight into its table row.
  res.json({ status: 'success', message: 'Refund processed successfully', data: await present(candidate), refund });
};

exports.sendReminders = async (req, res) => res.json(await candidates.sendReminders(req.body.time));
