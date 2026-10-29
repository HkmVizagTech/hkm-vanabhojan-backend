const mongoose = require('mongoose');

const collegeSchema = new mongoose.Schema(
  { name: { type: String, required: true, trim: true } },
  { timestamps: true }
);

// Case-insensitive uniqueness so "GITAM" and "gitam" cannot both exist.
collegeSchema.index({ name: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });

module.exports = mongoose.models.College || mongoose.model('College', collegeSchema);
