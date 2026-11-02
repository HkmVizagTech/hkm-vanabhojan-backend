const { Router } = require('express');
const controller = require('../controllers/attendance.controller');
const { authenticate, requireRole } = require('../middlewares/auth');
const { validate } = require('../middlewares/validate');
const schemas = require('../validators/candidate');
const { ROLES } = require('../config/constants');

const router = Router();
const staff = [authenticate, requireRole(ROLES.ADMIN, ROLES.USER)];

// Staff only: anyone who knew a phone number could otherwise pull that person's entry QR and use it.
router.post('/get-qr-codes', ...staff, validate({ body: schemas.phoneBody }), controller.getQrCodes);

router.post('/mark-attendance', ...staff, validate({ body: schemas.phoneBody }), controller.markByPhone);
router.post('/admin/attendance-scan', ...staff, validate({ body: schemas.scanBody }), controller.scan);
router.get('/admin/scanned-list', ...staff, validate({ query: schemas.eventQuery }), controller.scannedList);
router.get('/attendance-list', authenticate, requireRole(ROLES.ADMIN), validate({ query: schemas.attendanceReportQuery }), controller.report);

module.exports = router;
