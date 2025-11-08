const mongoose = require('mongoose');

const candidateSchema = new mongoose.Schema({
  serialNo: { type: Number },
  name: { type: String },
  gender: { type: String, enum: ['Male', 'Female', 'Other'] },
  college: { type: String },
  course: { type: String },
  companyName: { type: String },
  collegeOrWorking: { type: String, enum: ['College', 'Working'] },
  email: { type: String },
  year: { type: String },
  dob: { type: Date },
  registrationDate: { type: Date, default: Date.now },
  whatsappNumber: { type: String, required: true },
  howDidYouKnow: { type: String },

  paymentStatus: {
    type: String,
    enum: ['Pending', 'Paid', 'Failed', 'Refunded'],
    default: 'Pending',
  },
  paymentId: { type: String },
  orderId: { type: String },
  paymentAmount: { type: Number, required: true },
  paymentDate: { type: Date },
  paymentMethod: { type: String },
  paymentFailureReason: { type: String },
  receipt: { type: String },

  remindersSent: {
    threeDay: { type: Boolean, default: false },
    twoDay: { type: Boolean, default: false },
    oneDay: { type: Boolean, default: false },
    twoHour: { type: Boolean, default: false },
  },

  attendance: { type: Boolean, default: false },
  attendanceDate: { type: Date },

  adminAttendance: { type: Boolean, default: false },
  adminAttendanceDate: { type: Date },
  attendanceToken: { type: String }, 

  certificateSent: { type: Boolean, default: false },
  certificateSentDate: { type: Date },
  certificateSentBy: { type: String },


  certificateDocumentId: { type: String },
  certificateDriveFileId: { type: String },
  certificateDriveViewLink: { type: String },
  certificateFileName: { type: String },

  paymentUpdatedBy: { type: String, enum: ['manual', 'webhook', 'manual_check', 'manual_verification', 'enhanced_auto_check'], default: 'manual' },
  razorpayPaymentData: { type: mongoose.Schema.Types.Mixed },
  adminAction: { type: String, enum: ['Accepted', 'Rejected', 'Refunded'], default: null },
  adminActionDate: { type: Date },

  // Refund tracking fields
  refundId: { type: String },
  refundStatus: { type: String, enum: ['processed', 'pending', 'failed'], default: null },
  refundAmount: { type: Number },
  refundDate: { type: Date },

  // Student ID Card fields
  studentIdCardUrl: { type: String }, // Cloudinary URL
  studentIdCardPublicId: { type: String }, // Cloudinary public ID for deletion
}, { timestamps: true });

const Candidate = mongoose.model('Candidate', candidateSchema);

module.exports = Candidate;