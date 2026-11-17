const { Router } = require('express');
const controller = require('../controllers/college.controller');
const { authenticate, requireRole } = require('../middlewares/auth');
const { validate } = require('../middlewares/validate');
const { collegeBody, bulkBody } = require('../validators/college');
const { idParam } = require('../validators/common');
const { ROLES, VIEWER_ROLE } = require('../config/constants');

const router = Router();
const admin = [authenticate, requireRole(ROLES.ADMIN)];
// Devotees may add colleges (single or a list), but not rename or delete them.
const adder = [authenticate, requireRole(ROLES.ADMIN, VIEWER_ROLE)];

router.get('/', controller.list); // public: feeds the registration dropdown
router.post('/', ...adder, validate({ body: collegeBody }), controller.create);
router.post('/bulk', ...adder, validate({ body: bulkBody }), controller.bulkCreate);
router.put('/:id', ...admin, validate({ params: idParam('id'), body: collegeBody }), controller.update);
router.delete('/:id', ...admin, validate({ params: idParam('id') }), controller.remove);

module.exports = router;
