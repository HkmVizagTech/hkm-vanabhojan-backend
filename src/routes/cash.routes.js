const { Router } = require('express');
const controller = require('../controllers/cash.controller');
const { authenticate, requireCashAccess } = require('../middlewares/auth');
const { validate } = require('../middlewares/validate');
const schemas = require('../validators/candidate');
const { idParam } = require('../validators/common');

const router = Router();
const desk = [authenticate, requireCashAccess];

router.get('/cash', ...desk, controller.list);
router.post('/cash/register', ...desk, validate({ body: schemas.cashRegistration }), controller.register);
router.post('/cash/:id/send-qr', ...desk, validate({ params: idParam('id') }), controller.resend);

module.exports = router;
