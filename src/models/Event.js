const mongoose = require('mongoose');

const eventSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true }, // e.g. "Vanabhojanam 2026"
    date: { type: Date, required: true }, // the festival day (IST calendar date)
    venue: {
      name: { type: String, trim: true, default: '' },
      address: { type: String, trim: true, default: '' },
      mapsUrl: { type: String, trim: true, default: '' },
    },
    // Registration fee in rupees. The server charges exactly this, whatever the browser sends.
    fees: {
      college: { type: Number, required: true, min: 1 },
      working: { type: Number, required: true, min: 1 },
    },
    ageMin: { type: Number, default: 16 },
    ageMax: { type: Number, default: 31 },
    registrationOpen: { type: Boolean, default: false },
    // The edition shown on the public site and used for new registrations. Only one at a time.
    isCurrent: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

module.exports = mongoose.models.Event || mongoose.model('Event', eventSchema);
