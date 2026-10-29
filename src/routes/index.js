const { Router } = require('express');
const auth = require('./auth.routes');
const college = require('./college.routes');
const payment = require('./payment.routes');
const attendance = require('./attendance.routes');
const certificate = require('./certificate.routes');
const candidate = require('./candidate.routes');
const event = require('./event.routes');
const cash = require('./cash.routes');

const router = Router();

router.use('/admin/users', auth);
router.use('/college', college);
router.use('/events', event);
// All mounted at /users; the `/:id` routes live in `candidate` and must stay last.
router.use('/users', payment);
router.use('/users', cash);
router.use('/users', attendance);
router.use('/users', certificate);
router.use('/users', candidate);

module.exports = router;
