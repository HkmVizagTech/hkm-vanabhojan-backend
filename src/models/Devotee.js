const mongoose = require('mongoose');

/** A devotee allowed to sign in (by a code on WhatsApp) and look at registrations and attendance. Read-only. */
const devoteeSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    whatsappNumber: { type: String, required: true, unique: true }, // stored as 91XXXXXXXXXX
    active: { type: Boolean, default: true },
    lastLoginAt: Date,
  },
  { versionKey: false, timestamps: true }
);

module.exports = mongoose.models.Devotee || mongoose.model('Devotee', devoteeSchema);
