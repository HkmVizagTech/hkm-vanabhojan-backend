const mongoose = require('mongoose');

/** Atomic sequence numbers (e.g. the next team for a male attendee). `_id` names the sequence. */
const counterSchema = new mongoose.Schema({ _id: String, seq: { type: Number, default: 0 } }, { versionKey: false });

module.exports = mongoose.models.Counter || mongoose.model('Counter', counterSchema);
