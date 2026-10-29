const cron = require('node-cron');
const { env } = require('../config/env');
const { integrations } = require('../config/env');
const payments = require('../services/payment.service');
const logger = require('../utils/logger');

let task = null;
let running = false;

/**
 * Safety net for missed webhooks: every couple of minutes, ask Razorpay about recent pending payments.
 * Overlapping runs are skipped so a slow sweep never stacks up.
 */
function startPaymentReconciler() {
  if (!env.ENABLE_PAYMENT_CRON) return logger.info('Payment reconciler disabled');
  if (!integrations.razorpay) return logger.warn('Payment reconciler not started: Razorpay is not configured');

  task = cron.schedule(env.PAYMENT_CRON_SCHEDULE, async () => {
    if (running) return logger.debug('Payment reconciler still running, skipping this tick');
    running = true;
    try {
      const { totalChecked, totalUpdated } = await payments.reconcilePending({ limit: env.PAYMENT_CRON_BATCH });
      if (totalUpdated > 0) logger.info({ totalChecked, totalUpdated }, 'Reconciler confirmed payments');
    } catch (error) {
      logger.error({ err: error.message }, 'Payment reconciler failed');
    } finally {
      running = false;
    }
  });
  logger.info({ schedule: env.PAYMENT_CRON_SCHEDULE }, 'Payment reconciler started');
}

const stopPaymentReconciler = () => task?.stop();

module.exports = { startPaymentReconciler, stopPaymentReconciler };
