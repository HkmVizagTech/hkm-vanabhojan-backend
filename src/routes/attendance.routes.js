const { Router } = require('express');
const controller = require('../controllers/attendance.controller');
const { authenticate, requireRole } = require('../middlewares/auth');
const { validate } = require('../middlewares/validate');
const { publicLimiter } = require('../middlewares/rateLimit');
const schemas = require('../validators/candidate');
const { ROLES } = require('../config/constants');

const router = Router();
const staff = [authenticate, requireRole(ROLES.ADMIN, ROLES.USER)];

router.post('/get-qr-codes', publicLimiter, validate({ body: schemas.phoneBody }), controller.getQrCodes);

router.post('/mark-attendance', ...staff, validate({ body: schemas.phoneBody }), controller.markByPhone);
router.post('/admin/attendance-scan', ...staff, validate({ body: schemas.scanBody }), controller.scan);
router.get('/admin/scanned-list', ...staff, validate({ query: schemas.eventQuery }), controller.scannedList);
router.get('/attendance-list', authenticate, requireRole(ROLES.ADMIN), validate({ query: schemas.attendanceReportQuery }), controller.report);

module.exports = router;
