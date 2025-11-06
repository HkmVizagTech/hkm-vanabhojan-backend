require('dotenv').config();
const mongoose = require('mongoose');
const Candidate = require('./src/models/Candidate.model.js');
const sendWhatsappGupshup = require('./src/utils/sendWhatsappGupshup.js');

async function testWhatsAppForYourRegistration() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');
    
    // Get your latest registration
    const yourRegistration = await Candidate.findOne({ whatsappNumber: '918688487669' })
      .sort({ registrationDate: -1 });
    
    if (!yourRegistration) {
      console.log('❌ Registration not found');
      return;
    }
    
    console.log('=== TESTING WHATSAPP FOR YOUR REGISTRATION ===');
    console.log(`Name: ${yourRegistration.name}`);
    console.log(`WhatsApp: ${yourRegistration.whatsappNumber}`);
    console.log(`Type: ${yourRegistration.collegeOrWorking}`);
    console.log(`Payment Status: ${yourRegistration.paymentStatus}`);
    console.log('');
    
    // Simulate the exact WhatsApp logic from verifyPayment
    if (!yourRegistration.whatsappNumber) {
      console.error(`❌ Cannot send WhatsApp: whatsappNumber is missing`);
    } else {
      try {
        // Template selection based on registration type (same logic as verifyPayment)
        let templateId;
        if (yourRegistration.collegeOrWorking === 'Working') {
          templateId = "62641f1e-aad7-4c96-933d-b0de01d2ee4c";
          console.log(`💼 Using ₹1200 working professional template for ${yourRegistration.name}`);
        } else {
          templateId = "66ab1b5c-f2df-4fd7-b8dc-1ea139a1f35e";
          console.log(`🎓 Using common student registration template for ${yourRegistration.name}`);
        }
        
        console.log(`📤 Sending registration WhatsApp using template ${templateId} to ${yourRegistration.whatsappNumber}`);
        const whatsappResult = await sendWhatsappGupshup(yourRegistration, [yourRegistration.name], templateId);
        console.log(`✅ Registration WhatsApp sent successfully:`, whatsappResult);
        
        if (whatsappResult && whatsappResult.status === 'submitted') {
          console.log('');
          console.log('🎉 SUCCESS! WhatsApp was sent successfully!');
          console.log(`📝 Message ID: ${whatsappResult.messageId}`);
          console.log('📱 Check your WhatsApp now!');
          console.log('');
          console.log('💡 This means the WhatsApp system is working fine.');
          console.log('💡 The issue might be that the WhatsApp was not sent during your actual registration.');
        } else {
          console.log('❌ WhatsApp sending failed:', whatsappResult);
        }
        
      } catch (error) {
        console.error(`❌ Failed to send registration WhatsApp:`, error.message);
        console.error(`❌ Error details:`, error);
      }
    }
    
    mongoose.connection.close();
  } catch (error) {
    console.error('Error:', error);
    mongoose.connection.close();
  }
}

testWhatsAppForYourRegistration();
