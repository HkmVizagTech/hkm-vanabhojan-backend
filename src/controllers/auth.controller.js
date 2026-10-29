const authService = require('../services/auth.service');

const publicUser = u => ({ id: u.id, email: u.email, role: u.role, name: u.name, isSuperAdmin: Boolean(u.isSuperAdmin), canCollectCash: Boolean(u.canCollectCash) });

exports.register = async (req, res) => {
  const user = await authService.register(req.body, req.user);
  res.status(201).json({ status: 'success', message: 'Sign up successful', user });
};

exports.login = async (req, res) => {
  const { token, user } = await authService.login(req.body);
  res.json({ status: 'success', message: 'login success', token, id: user.id, role: user.role, name: user.name, isSuperAdmin: Boolean(user.isSuperAdmin), canCollectCash: Boolean(user.canCollectCash) });
};

exports.validateToken = (req, res) => {
  res.json({ status: 'success', message: 'Token is valid', user: publicUser(req.user) });
};

exports.updateUser = async (req, res) => {
  const user = await authService.updateUser(req.params.id, req.body, req.user);
  res.json({ status: 'success', user });
};

exports.deleteUser = async (req, res) => {
  await authService.deleteUser(req.params.id, req.user);
  res.json({ status: 'success', message: 'User deleted' });
};

exports.listUsers = async (_req, res) => {
  const user = await authService.listUsers();
  res.json({ status: 'success', user, message: 'All users fetched successfully' });
};
