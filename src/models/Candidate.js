const mongoose = require('mongoose');
const { CANDIDATE_TYPES, PAYMENT_STATUS, ADMIN_ACTIONS, PAYMENT_SOURCES } = require('../config/constants');

const { Schema } = mongoose;

const candidateSchema = new Schema(
  {
    event: { type: Schema.Types.ObjectId, ref: 'Event', index: true }, // which edition they registered for
    serialNo: Number,
    name: { type: String, trim: true },
    gender: { type: String, enum: ['Male', 'Female', 'Other'] },
    email: { type: String, trim: true, lowercase: true },
    whatsappNumber: { type: String, required: true, index: true }, // stored as 91XXXXXXXXXX
    dob: Date,
    howDidYouKnow: String,

    collegeOrWorking: { type: String, enum: Object.values(CANDIDATE_TYPES) },
    college: String,
    course: String,
    year: String,
    companyName: String,

    registrationDate: { type: Date, default: Date.now, index: true },

    // payment
    paymentStatus: { type: String, enum: Object.values(PAYMENT_STATUS), default: PAYMENT_STATUS.PENDING, index: true },
    paymentAmount: { type: Number, required: true }, // rupees
    paymentId: { type: String, index: true },
    orderId: { type: String, index: true },
    paymentDate: Date,
    paymentVerifiedAt: Date,
    paymentMethod: String,
    paymentFailureReason: String,
    paymentUpdatedBy: { type: String, enum: PAYMENT_SOURCES, default: 'manual' },
    razorpayPaymentData: Schema.Types.Mixed,
    receipt: String,

    // cash desk (walk-ins paying in person)
    collectedBy: String, // email of the staff member who took the cash
    collectedByName: String,
    cashCollectedAt: Date,
    qrSentAt: Date,
    qrSendStatus: { type: String, enum: ['sent', 'failed', null], default: null },

    // refunds
    refundId: String,
    refundStatus: { type: String, enum: ['processed', 'pending', 'failed', null], default: null },
    refundAmount: Number,
    refundDate: Date,

    // admin review
    adminAction: { type: String, enum: [...Object.values(ADMIN_ACTIONS), null], default: null },
    adminActionDate: Date,

    // attendance
    attendanceToken: { type: String, index: { unique: true, sparse: true } },
    attendance: { type: Boolean, default: false },
    attendanceDate: Date,
    adminAttendance: { type: Boolean, default: false },
    adminAttendanceDate: Date,
    adminAttendanceBy: String,

    // student id card (Cloudflare R2)
    studentIdCardKey: String, // object key in R2; a short-lived signed URL is produced on read

    // certificates
    certificateSent: { type: Boolean, default: false },
    certificateSentDate: Date,
    certificateSentBy: String,
    certificateDocumentId: { type: String, index: true },
    certificateUrl: String,
    certificateStorageKey: String,
    certificateFileName: String,
    certificateFileSize: Number,
    certificateStorageMethod: String,
    certificateWhatsAppMessageId: String,
    certificateWhatsAppStatus: String,
    certificateDeliveryMethod: String,

    remindersSent: {
      threeDay: { type: Boolean, default: false },
      twoDay: { type: Boolean, default: false },
      oneDay: { type: Boolean, default: false },
      twoHour: { type: Boolean, default: false },
    },
  },
  { timestamps: true }
);

// Admin lists sort by newest registration and filter by payment state.
candidateSchema.index({ paymentStatus: 1, registrationDate: -1 });
candidateSchema.index({ event: 1, paymentStatus: 1 });
candidateSchema.index({ adminAttendance: 1, adminAttendanceDate: -1 });

candidateSchema.virtual('isPaid').get(function isPaid() {
  return this.paymentStatus === PAYMENT_STATUS.PAID;
});

module.exports = mongoose.models.Candidate || mongoose.model('Candidate', candidateSchema);
