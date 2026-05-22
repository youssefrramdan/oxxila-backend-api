// src/middlewares/requestTiming.middleware.js
import logger from '../config/logger.js';

export const requestTiming = (req, res, next) => {
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
    if (req.path.startsWith('/api/')) {
      logger.info('request', {
        method: req.method,
        path: req.originalUrl,
        statusCode: res.statusCode,
        durationMs: Math.round(durationMs * 100) / 100,
      });
    }
  });
  next();
};
