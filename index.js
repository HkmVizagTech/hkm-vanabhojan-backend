const express = require('express');
const cors = require('cors');
const gupshup=require('@api/gupshup');
const Candidate = require('./src/models/Candidate.model');
const cron = require('node-cron');
const { Connection } = require('./src/config/db');
const { CandidateRouter } = require('./src/routes/candidate.routes');
const bodyParser = require('body-parser');
const { CandidateController } = require('./src/controllers/Candidate.controller');
const {userRouter} = require('./src/routes/user.Routes');

const app = express();

app.use(cors());


app.post('/users/webhook', bodyParser.json({
  verify: (req, res, buf) => { req.rawBody = buf; }
}), CandidateController.webhook);


app.get('/users/webhook-test', (req, res) => {
  console.log(' Webhook test endpoint called at:', new Date().toISOString());
  res.json({ 
    status: 'ok', 
    message: 'Webhook endpoint is reachable',
    timestamp: new Date().toISOString(),
    server: 'production'
  });
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    message: 'HKM Vanabhojan Backend Server',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});


app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString()
  });
});

app.get('/emergency-payment-fix', (req, res) => {
  console.log(' Emergency payment fix endpoint called at:', new Date().toISOString());
  res.json({ 
    status: 'ok', 
    message: 'Emergency endpoint is working. Use /check-pending-payments for payment fixes.',
    timestamp: new Date().toISOString(),
    server: 'production'
  });
});


app.get('/check-pending-payments', async (req, res) => {
  try {
    console.log(' Check pending payments called at:', new Date().toISOString());
    const { CandidateController } = require('./src/controllers/Candidate.controller');
    
  
    const mockReq = { user: { role: 'admin' } };
    const mockRes = {
      json: (data) => {
        console.log(' Payment check results:', JSON.stringify(data, null, 2));
        res.json(data);
      },
      status: (code) => ({
        json: (data) => {
          console.log(` Payment check error (${code}):`, data);
          res.status(code).json(data);
        }
      })
    };
    
    await CandidateController.checkPendingPayments(mockReq, mockRes);
  } catch (error) {
    console.error(' Check pending payments error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.use("/users", CandidateRouter);
app.use("/admin/users", userRouter)


const PORT = process.env.PORT || 3300;


process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});


let isPaymentCheckRunning = false;

const startAutomaticPaymentChecker = () => {
  console.log('🤖 Starting automatic payment status checker...');
  
  // Run every 2 minutes instead of 30 seconds to avoid blocking
  cron.schedule('*/2 * * * *', async () => {
    if (isPaymentCheckRunning) {
      console.log(' Payment check already running, skipping this cycle');
      return;
    }
    
    isPaymentCheckRunning = true;
    try {
      console.log(' Auto-checking pending payments...', new Date().toISOString());
      
      const { CandidateController } = require('./src/controllers/Candidate.controller');
      
      // Create a lightweight request for auto-checking
      const mockReq = { 
        user: { role: 'admin' },
        query: { limit: 50 } // Process only 50 payments at a time
      };
      const mockRes = {
        json: (data) => {
          if (data.totalUpdated > 0) {
            console.log(` ✅ Auto-updated ${data.totalUpdated} payments automatically`);
          } else {
            console.log(' ⏱️ No pending payments to update');
          }
        },
        status: (code) => ({
          json: (data) => {
            console.log(` ❌ Auto-payment check error (${code}):`, data.message);
          }
        })
      };
      
      await CandidateController.checkPendingPayments(mockReq, mockRes);
    } catch (error) {
      console.error(' ❌ Auto payment check failed:', error.message);
    } finally {
      isPaymentCheckRunning = false;
    }
  });
};


const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(` Server starting on port ${PORT}`);
  console.log(` Server started at: ${new Date().toISOString()}`);
  

  Connection()
    .then(() => {
      console.log('✅ Database connected successfully');
      
      
      setTimeout(() => {
        startAutomaticPaymentChecker();
        console.log('🤖 Automatic payment checker started - will run every 2 minutes');
      }, 5000); 
      
    })
    .catch((error) => {
      console.error(' Database connection failed:', error);
    
    });
});

server.on('error', (error) => {
  console.error(' Server error:', error);
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use`);
  }
  process.exit(1);
});