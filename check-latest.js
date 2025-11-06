require('dotenv').config();
const mongoose = require('mongoose');
const Candidate = require('./src/models/Candidate.model.js');

async function checkLatestRegistration() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');
    
    // Get the very latest registration
    const latestCandidate = await Candidate.findOne({})
      .sort({ registrationDate: -1 })
      .select('name whatsappNumber collegeOrWorking paymentStatus registrationDate paymentDate paymentId orderId');
    
    if (latestCandidate) {
      console.log('=== LATEST REGISTRATION ===');
      console.log(`Name: ${latestCandidate.name}`);
      console.log(`WhatsApp: ${latestCandidate.whatsappNumber}`);
      console.log(`Type: ${latestCandidate.collegeOrWorking}`);
      console.log(`Payment Status: ${latestCandidate.paymentStatus}`);
      console.log(`Registered: ${latestCandidate.registrationDate}`);
      console.log(`Payment Date: ${latestCandidate.paymentDate || 'Not set'}`);
      console.log(`Payment ID: ${latestCandidate.paymentId || 'Not set'}`);
      console.log(`Order ID: ${latestCandidate.orderId}`);
      console.log('');
      
      // Check if this is your number
      if (latestCandidate.whatsappNumber === '918688487669') {
        console.log('✅ This is your registration!');
        
        if (latestCandidate.paymentStatus === 'Paid') {
          console.log('✅ Payment is marked as PAID - WhatsApp should have been sent');
          console.log('🔍 This means there might be an issue with WhatsApp sending...');
        } else {
          console.log('❌ Payment is still PENDING - that is why no WhatsApp was sent');
          console.log('💡 Users only get WhatsApp messages after successful payment');
          console.log('');
          console.log('🔍 Let me check if payment was actually made on Razorpay...');
        }
      } else {
        console.log('ℹ️ This is not your registration (different phone number)');
        console.log('🔍 Let me check for your number specifically...');
        
        const yourRegistration = await Candidate.findOne({ whatsappNumber: '918688487669' })
          .sort({ registrationDate: -1 });
          
        if (yourRegistration) {
          console.log('');
          console.log('=== YOUR LATEST REGISTRATION ===');
          console.log(`Name: ${yourRegistration.name}`);
          console.log(`Payment Status: ${yourRegistration.paymentStatus}`);
          console.log(`Registered: ${yourRegistration.registrationDate}`);
          console.log(`Payment Date: ${yourRegistration.paymentDate || 'Not set'}`);
          console.log(`Order ID: ${yourRegistration.orderId}`);
        } else {
          console.log('❌ No registration found for your number 8688487669');
        }
      }
    } else {
      console.log('❌ No registrations found in database');
    }
    
    mongoose.connection.close();
  } catch (error) {
    console.error('Error:', error);
    mongoose.connection.close();
  }
}

checkLatestRegistration();
