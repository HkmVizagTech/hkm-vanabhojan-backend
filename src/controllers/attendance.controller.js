const attendance = require('../services/attendance.service');

exports.getQrCodes = async (req, res) => res.json(await attendance.getQrCodes(req.body.whatsappNumber));
exports.markByPhone = async (req, res) => res.json(await attendance.markByPhone(req.body.whatsappNumber));
exports.scan = async (req, res) => res.json(await attendance.scan(req.body.token, req.user));
exports.scannedList = async (req, res) => res.json(await attendance.listScanned(req.valid.query.event));
exports.report = async (req, res) => res.json(await attendance.attendanceReport(req.valid.query));
