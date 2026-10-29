const { Router } = require('express');
const controller = require('../controllers/event.controller');
const { authenticate, requireRole } = require('../middlewares/auth');
const { validate } = require('../middlewares/validate');
const { eventBody, followupQuery, followupSendBody } = require('../validators/event');
const { idParam } = require('../validators/common');
const { ROLES } = require('../config/constants');

const router = Router();
const admin = [authenticate, requireRole(ROLES.ADMIN)];
const staff = [authenticate, requireRole(ROLES.ADMIN, ROLES.USER)];

router.get('/current', controller.current); // public: drives the registration site

router.get('/', ...staff, controller.list);
router.get('/analytics', ...admin, controller.analytics);
router.get('/followup', ...admin, validate({ query: followupQuery }), controller.followup);
router.post('/followup/send', ...admin, validate({ body: followupSendBody }), controller.sendFollowup);

router.post('/', ...admin, validate({ body: eventBody }), controller.create);
router.put('/:id', ...admin, validate({ params: idParam('id'), body: eventBody }), controller.update);
router.delete('/:id', ...admin, validate({ params: idParam('id') }), controller.remove);
router.post('/:id/set-current', ...admin, validate({ params: idParam('id') }), controller.setCurrent);
router.post('/:id/adopt-legacy', ...admin, validate({ params: idParam('id') }), controller.adoptLegacy);

module.exports = router;
