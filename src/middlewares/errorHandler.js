const { ZodError } = require('zod');
const multer = require('multer');
const ApiError = require('../utils/ApiError');
const logger = require('../utils/logger');
const { isProd } = require('../config/env');

const notFound = (req, _res, next) => next(ApiError.notFound(`Route not found: ${req.method} ${req.path}`));

// Express 5 forwards rejected promises here, so controllers need no try/catch boilerplate.
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, _next) {
  let status = 500;
  let message = 'Internal server error';
  let details;

  if (err instanceof ApiError) {
    ({ statusCode: status, message, details } = err);
  } else if (err instanceof ZodError) {
    status = 400;
    message = 'Validation failed';
    details = err.issues.map(i => ({ field: i.path.join('.'), message: i.message }));
    // Surface the first problem in `message` too: the UI shows only that string.
    message = details[0] ? details[0].message : message;
  } else if (err instanceof multer.MulterError) {
    status = 400;
    message = err.code === 'LIMIT_FILE_SIZE' ? 'File too large (max 5MB)' : err.message;
  } else if (err.name === 'CastError') {
    status = 400;
    message = `Invalid ${err.path}`;
  } else if (err.code === 11000) {
    status = 409;
    message = 'Already exists';
  } else if (err.type === 'entity.parse.failed') {
    status = 400;
    message = 'Malformed JSON body';
  } else if (err.message?.startsWith('Invalid file type')) {
    status = 400;
    message = err.message;
  } else if (!isProd) {
    message = err.message;
  }

  if (status >= 500) logger.error({ err, path: req.path, method: req.method }, 'Unhandled error');
  res.status(status).json({ status: 'error', message, ...(details ? { details } : {}) });
}

module.exports = { notFound, errorHandler };
