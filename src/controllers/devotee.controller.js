const devotees = require('../services/devotee.service');

exports.list = async (_req, res) => {
  const all = await devotees.list();
  res.json({ status: 'success', devotees: all, total: all.length });
};

exports.add = async (req, res) => res.status(201).json({ status: 'success', devotee: await devotees.add(req.body) });

exports.addMany = async (req, res) => res.json({ status: 'success', ...(await devotees.addMany(req.body.rows)) });

exports.update = async (req, res) => res.json({ status: 'success', devotee: await devotees.update(req.params.id, req.body) });

exports.remove = async (req, res) => {
  await devotees.remove(req.params.id);
  res.json({ status: 'success', message: 'Devotee removed' });
};

exports.requestCode = async (req, res) => {
  const { minutes } = await devotees.requestCode(req.body.phone);
  res.json({ status: 'success', message: `A code has been sent to your WhatsApp. It is valid for ${minutes} minutes.` });
};

exports.verifyCode = async (req, res) => {
  const { token, devotee } = await devotees.verifyCode(req.body.phone, req.body.otp);
  res.json({ status: 'success', token, id: devotee.id, name: devotee.name, role: devotee.role });
};
