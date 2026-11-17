const mongoose = require('mongoose');

/** The pending sign-in code for one number. Only a hash is kept; the row deletes itself after it expires. */
const devoteeOtpSchema = new mongoose.Schema(
  {
    whatsappNumber: { type: String, required: true, unique: true },
    codeHash: { type: String, required: true },
    expiresAt: { type: Date, required: true, index: { expires: 0 } },
    attempts: { type: Number, default: 0 },
    lastSentAt: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

module.exports = mongoose.models.DevoteeOtp || mongoose.model('DevoteeOtp', devoteeOtpSchema);
