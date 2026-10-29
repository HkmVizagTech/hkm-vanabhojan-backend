const mongoose = require('mongoose');
const { ROLES } = require('../config/constants');

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true, unique: true },
    password: { type: String, required: true, select: false },
    role: { type: String, enum: Object.values(ROLES), default: ROLES.USER },
    // Disabled accounts cannot sign in and their tokens stop working immediately.
    active: { type: Boolean, default: true },
    // The owner account: hidden from staff lists and immune to disable/delete/role changes.
    isSuperAdmin: { type: Boolean, default: false },
    // Volunteers with this may use the Cash desk: register walk-ins, take cash, issue QR passes.
    canCollectCash: { type: Boolean, default: false },
  },
  { versionKey: false, timestamps: true }
);

userSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.password;
    return ret;
  },
});

// Keeps the existing "users" collection.
module.exports = mongoose.models.user || mongoose.model('user', userSchema);
