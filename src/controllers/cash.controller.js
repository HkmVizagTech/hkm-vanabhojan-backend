const cash = require('../services/cash.service');

exports.register = async (req, res) => res.status(201).json({ status: 'success', ...(await cash.register(req.body, req.user)) });
exports.resend = async (req, res) => res.json({ status: 'success', ...(await cash.resend(req.params.id)) });
exports.list = async (req, res) => res.json({ status: 'success', ...(await cash.list(req.user)) });
