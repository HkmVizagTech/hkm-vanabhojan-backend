const { Router } = require('express');
const controller = require('../controllers/payment.controller');
const { authenticate, requireRole } = require('../middlewares/auth');
const { validate } = require('../middlewares/validate');
const { upload } = require('../middlewares/upload');
const { publicLimiter } = require('../middlewares/rateLimit');
const schemas = require('../validators/candidate');
const { idParam } = require('../validators/common');
const { ROLES } = require('../config/constants');

const router = Router();
const admin = [authenticate, requireRole(ROLES.ADMIN)];

// Public: used by the registration and thank-you pages.
router.post('/create-order', publicLimiter, validate({ body: schemas.createOrderBody }), controller.createOrder);
router.post(
  '/create-order-with-file',
  publicLimiter,
  upload.single('studentIdCard'),
  validate({ body: schemas.createOrderWithFileBody }),
  controller.createOrderWithFile
);
router.post('/verify-payment', publicLimiter, validate({ body: schemas.paymentCallback }), controller.verifyPayment);
router.post('/verify-payment-immediately', publicLimiter, validate({ body: schemas.immediateVerify }), controller.verifyImmediately);
router.get('/verify-payment/:id', publicLimiter, controller.paymentStatus);

// Admin tools.
router.post('/check-pending-payments', ...admin, controller.checkPending);
router.get('/force-check-payment/:candidateId', ...admin, validate({ params: idParam('candidateId') }), controller.forceCheck);

module.exports = router;
