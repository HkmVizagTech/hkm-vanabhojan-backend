const multer = require('multer');

const ALLOWED = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) =>
    ALLOWED.includes(file.mimetype)
      ? cb(null, true)
      : cb(new Error('Invalid file type. Only JPG, PNG, and WebP files are allowed.')),
});

module.exports = { upload };
