const certificates = require('../services/certificate.service');
const candidates = require('../services/candidate.service');
const { isDbReady } = require('../config/db');

exports.eligible = async (_req, res) => res.json(await certificates.listEligible());

exports.sendBulk = async (req, res) => {
  res.json(await certificates.sendBulk({ candidateIds: req.body.candidateIds, issuedBy: req.user.email }));
};

exports.sendOne = async (req, res) => {
  const candidate = await candidates.findOrFail(req.body.candidateId);
  const result = await certificates.sendOne(candidate, req.user.email);
  if (result.status === 'already-sent') {
    return res.json({
      status: 'already-sent',
      message: `Certificate already sent to ${candidate.name} on ${candidate.certificateSentDate?.toLocaleDateString()}`,
      candidate: { id: candidate._id, name: candidate.name, certificateSentDate: candidate.certificateSentDate, documentId: candidate.certificateDocumentId },
    });
  }
  res.json({
    status: 'success',
    message: `Certificate sent successfully to ${candidate.name}`,
    candidate: { id: candidate._id, name: candidate.name, documentId: result.documentId, url: result.file.url },
    whatsapp: result.whatsapp,
    file: result.file,
  });
};

exports.resend = async (req, res) => {
  const candidate = await candidates.findOrFail(req.body.candidateId);
  const result = await certificates.resend(candidate, req.user.email);
  res.json({
    status: 'success',
    message: `Certificate resent successfully to ${candidate.name}`,
    oldCertificate: result.previous,
    newCertificate: { documentId: result.documentId, url: result.file.url, whatsappMessageId: result.whatsapp.messageId },
  });
};

exports.generateOnly = async (req, res) => {
  const candidate = await candidates.findOrFail(req.body.candidateId);
  const certificate = await certificates.generateOnly(candidate);
  res.json({ status: 'success', path: certificate.outputPath, certificate });
};

exports.byDocumentId = async (req, res) => {
  res.json({ status: 'success', certificate: await certificates.findByDocumentId(req.params.documentId) });
};

exports.statistics = async (_req, res) => res.json({ status: 'success', statistics: await certificates.statistics() });

exports.health = async (_req, res) => res.json({ status: 'success', health: await certificates.health(isDbReady()) });
