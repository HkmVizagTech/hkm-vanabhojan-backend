const { Router } = require('express');
const controller = require('../controllers/candidate.controller');
const { authenticate, requireRole } = require('../middlewares/auth');
const { validate } = require('../middlewares/validate');
const schemas = require('../validators/candidate');
const { idParam } = require('../validators/common');
const { ROLES } = require('../config/constants');

const router = Router();
const admin = [authenticate, requireRole(ROLES.ADMIN)];
const staff = [authenticate, requireRole(ROLES.ADMIN, ROLES.USER)];

router.get('/', ...admin, validate({ query: schemas.listQuery }), controller.list);
router.post('/send', ...admin, validate({ body: schemas.reminderBody }), controller.sendReminders);

router.post('/admin/accept/:candidateId', ...admin, validate({ params: idParam('candidateId') }), controller.accept);
router.post('/admin/reject/:candidateId', ...admin, validate({ params: idParam('candidateId') }), controller.reject);
router.post('/admin/refund/:candidateId', ...admin, validate({ params: idParam('candidateId') }), controller.refund);

router.delete('/by-name', ...admin, validate({ body: schemas.deleteByNameBody }), controller.removeByName);
router.get('/:id', ...staff, validate({ params: idParam('id') }), controller.get);
router.put('/:id', ...admin, validate({ params: idParam('id'), body: schemas.adminUpdate }), controller.update);
router.delete('/:id', ...admin, validate({ params: idParam('id') }), controller.remove);

module.exports = router;
