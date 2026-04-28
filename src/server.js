// src/server.js
import app from './app.js';
import logger from './config/logger.js';
import databaseConnection from './config/db.js';
import { startOfferCron } from './utils/offerCron.js';

await databaseConnection();
startOfferCron();

const PORT = process.env.PORT || 3000;

const server = app.listen(PORT, () => {
  logger.info(`Server is running on port ${PORT}`);
});

const gracefulShutdown = signal => {
  logger.info(`${signal} received. Shutting down gracefully...`);
  server.close(() => {
    logger.info('Process terminated');
    process.exit(0);
  });
};

const unexpectedErrorHandler = error => {
  logger.error(error);
  logger.info('Server is shutting down due to unexpected error...');
  process.exit(1);
};

process.on('unhandledRejection', unexpectedErrorHandler);
process.on('uncaughtException', unexpectedErrorHandler);
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
