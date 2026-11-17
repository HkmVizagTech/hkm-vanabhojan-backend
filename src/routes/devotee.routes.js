const { Router } = require('express');
const controller = require('../controllers/devotee.controller');
const { authenticate, requireRole } = require('../middlewares/auth');
const { validate } = require('../middlewares/validate');
const { authLimiter } = require('../middlewares/rateLimit');
const schemas = require('../validators/devotee');
const { idParam } = require('../validators/common');
const { ROLES } = require('../config/constants');

/** /admin/devotees: the list, managed by admins only. */
const admin = Router();
admin.use(authenticate, requireRole(ROLES.ADMIN));
admin.get('/', controller.list);
admin.post('/', validate({ body: schemas.addBody }), controller.add);
admin.post('/bulk', validate({ body: schemas.bulkBody }), controller.addMany);
admin.patch('/:id', validate({ params: idParam('id'), body: schemas.updateBody }), controller.update);
admin.delete('/:id', validate({ params: idParam('id') }), controller.remove);

/** /devotee-auth: public sign-in by a code on WhatsApp. */
const auth = Router();
auth.post('/otp', authLimiter, validate({ body: schemas.requestCodeBody }), controller.requestCode);
auth.post('/verify', authLimiter, validate({ body: schemas.verifyCodeBody }), controller.verifyCode);

module.exports = { admin, auth };
