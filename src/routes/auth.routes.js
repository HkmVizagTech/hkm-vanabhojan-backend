const { Router } = require('express');
const controller = require('../controllers/auth.controller');
const { authenticate, authenticateOptional, requireRole } = require('../middlewares/auth');
const { validate } = require('../middlewares/validate');
const { authLimiter } = require('../middlewares/rateLimit');
const schemas = require('../validators/auth');
const { idParam } = require('../validators/common');
const { ROLES } = require('../config/constants');

const router = Router();

router.get('/', authenticate, requireRole(ROLES.ADMIN), controller.listUsers);
// Open only for the very first account; afterwards an admin token is required (enforced in the service).
router.post('/register', authLimiter, authenticateOptional, validate({ body: schemas.register }), controller.register);
router.post('/login', authLimiter, validate({ body: schemas.login }), controller.login);
router.post('/validate-token', authenticate, controller.validateToken);
router.patch('/:id', authenticate, requireRole(ROLES.ADMIN), validate({ params: idParam('id'), body: schemas.updateUser }), controller.updateUser);
router.delete('/:id', authenticate, requireRole(ROLES.ADMIN), validate({ params: idParam('id') }), controller.deleteUser);

module.exports = router;
