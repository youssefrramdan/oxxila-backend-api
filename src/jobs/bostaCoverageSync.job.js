// src/jobs/bostaCoverageSync.job.js
import cron from 'node-cron';
import Carrier from '../models/Carrier.js';
import logger from '../config/logger.js';
import { getBostaCredentials } from '../controllers/orderShipping.controller.js';
import { syncBostaCoveredOnly } from '../controllers/carrier.controller.js';

export const startBostaCoverageSyncJob = () => {
  cron.schedule('0 2 * * *', async () => {
    try {
      const carrier = await Carrier.findOne({
        type: 'api',
        apiProvider: 'bosta',
      }).select('+apiKey +apiBaseUrl');

      if (!carrier) return;

      const credentials = await getBostaCredentials(carrier);
      if (!credentials) {
        logger.warn('[BostaCoverageSync] Bosta carrier has no API credentials configured');
        return;
      }

      const result = await syncBostaCoveredOnly(credentials);
      logger.info('[BostaCoverageSync] Completed', result);
    } catch (err) {
      logger.error('[BostaCoverageSync] Failed', {
        error: err.message,
        stack: err.stack,
      });
    }
  });
};
