const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const pinoHttp = require('pino-http');
const { env } = require('./config/env');
const { isDbReady } = require('./config/db');
const logger = require('./utils/logger');
const routes = require('./routes');
const paymentController = require('./controllers/payment.controller');
const { notFound, errorHandler } = require('./middlewares/errorHandler');

function createApp() {
  const app = express();
  app.set('trust proxy', 1); // behind Cloud Run / a load balancer: real client IPs for rate limiting

  const allowed = env.CORS_ORIGINS.split(',').map(o => o.trim()).filter(Boolean);
  app.use(helmet());
  app.use(cors(allowed.length ? { origin: allowed } : undefined));
  app.use(
    pinoHttp({
      logger,
      autoLogging: { ignore: req => req.url === '/health' },
      serializers: { req: r => ({ method: r.method, url: r.url }), res: r => ({ statusCode: r.statusCode }) },
    })
  );

  // The webhook signature covers the exact bytes Razorpay sent, so it must be parsed raw,
  // before express.json() runs.
  app.post('/users/webhook', express.raw({ type: '*/*', limit: '1mb' }), paymentController.webhook);
  app.get('/users/webhook-test', (_req, res) => res.json({ status: 'ok', message: 'Webhook endpoint is reachable', timestamp: new Date().toISOString() }));

  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  app.get('/', (_req, res) => res.json({ status: 'ok', message: 'HKM Vanabhojan Backend Server', version: '2.0.0', timestamp: new Date().toISOString() }));
  app.get('/health', (_req, res) => {
    const ready = isDbReady();
    res.status(ready ? 200 : 503).json({ status: ready ? 'healthy' : 'unhealthy', database: ready ? 'connected' : 'disconnected', timestamp: new Date().toISOString() });
  });

  app.use(routes);
  app.use(notFound);
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
