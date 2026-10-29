const { env, integrations } = require('./config/env');
const { connectDb, disconnectDb } = require('./config/db');
const { createApp } = require('./app');
const { startPaymentReconciler, stopPaymentReconciler } = require('./jobs/paymentReconciler');
const logger = require('./utils/logger');

async function main() {
  const missing = Object.entries(integrations).filter(([, ok]) => !ok).map(([name]) => name);
  if (missing.length) logger.warn({ missing }, 'Some integrations are not configured; related features will return 503');

  await connectDb();
  const app = createApp();
  const server = app.listen(env.PORT, '0.0.0.0', () => logger.info({ port: env.PORT, env: env.NODE_ENV }, 'Server listening'));
  startPaymentReconciler();

  let closing = false;
  const shutdown = async signal => {
    if (closing) return;
    closing = true;
    logger.info({ signal }, 'Shutting down');
    stopPaymentReconciler();
    server.close(async () => {
      await disconnectDb();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

process.on('unhandledRejection', reason => logger.error({ reason }, 'Unhandled rejection'));
process.on('uncaughtException', error => {
  logger.fatal({ err: error }, 'Uncaught exception');
  process.exit(1);
});

main().catch(error => {
  logger.fatal({ err: error }, 'Failed to start');
  process.exit(1);
});
