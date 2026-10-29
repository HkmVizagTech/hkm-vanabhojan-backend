const { Router } = require('express');
const controller = require('../controllers/certificate.controller');
const { authenticate, requireRole } = require('../middlewares/auth');
const { validate } = require('../middlewares/validate');
const schemas = require('../validators/candidate');
const { ROLES } = require('../config/constants');

const router = Router();
const admin = [authenticate, requireRole(ROLES.ADMIN)];

// Public verification link (name + document only).
router.get('/certificate/:documentId', controller.byDocumentId);

router.get('/eligible-for-certificate', ...admin, controller.eligible);
router.get('/certificate-statistics', ...admin, controller.statistics);
router.get('/certificate-system-health', ...admin, controller.health);
router.post('/send-certificates', ...admin, validate({ body: schemas.bulkCertificatesBody }), controller.sendBulk);
router.post('/send-single-certificate', ...admin, validate({ body: schemas.candidateIdBody }), controller.sendOne);
router.post('/resend-certificate', ...admin, validate({ body: schemas.candidateIdBody }), controller.resend);
router.post('/generate-single-certificate', ...admin, validate({ body: schemas.candidateIdBody }), controller.generateOnly);

module.exports = router;
