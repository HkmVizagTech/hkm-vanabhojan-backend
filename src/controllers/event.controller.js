const events = require('../services/event.service');
const ApiError = require('../utils/ApiError');

exports.current = async (_req, res) => {
  const event = await events.getCurrent();
  res.json({ status: 'success', event: events.publicView(event) || null });
};

exports.list = async (_req, res) => res.json({ status: 'success', ...(await events.list()) });

exports.create = async (req, res) => {
  const event = await events.create(req.body);
  res.status(201).json({ status: 'success', event });
};

exports.update = async (req, res) => res.json({ status: 'success', event: await events.update(req.params.id, req.body) });

exports.remove = async (req, res) => {
  await events.remove(req.params.id);
  res.json({ status: 'success', message: 'Event deleted' });
};

exports.setCurrent = async (req, res) => res.json({ status: 'success', event: await events.setCurrent(req.params.id) });

exports.adoptLegacy = async (req, res) => {
  const adopted = await events.adoptLegacy(req.params.id);
  res.json({ status: 'success', adopted });
};

exports.analytics = async (_req, res) => res.json({ status: 'success', ...(await events.analytics()) });

exports.followup = async (req, res) => {
  const { from, to } = req.valid.query;
  if (from === to) throw ApiError.badRequest('Choose two different events');
  res.json({ status: 'success', ...(await events.followupList(req.valid.query)) });
};

exports.sendFollowup = async (req, res) => {
  if (req.body.from === req.body.to) throw ApiError.badRequest('Choose two different events');
  res.json({ status: 'success', ...(await events.sendFollowup(req.body)) });
};
