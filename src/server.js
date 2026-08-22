// src/server.js
import app from './app.js';
import logger from './config/logger.js';
import databaseConnection from './config/db.js';
import PaymentGateway from './models/PaymentGateway.js';
import ShippingMethodSetting from './models/ShippingMethodSetting.js';
import SiteSettings from './models/SiteSettings.js';
import ContentPage from './models/ContentPage.js';
import AdminRole from './models/AdminRole.js';
import dotenv from 'dotenv';

await databaseConnection();
await PaymentGateway.ensureDefaults();
await ShippingMethodSetting.ensureDefaults();
await SiteSettings.getSingleton();
await ContentPage.ensureDefaults();
await AdminRole.ensureSuperAdmin();
await AdminRole.backfillAdminUsers();
dotenv.config();

const PORT = process.env.PORT || 3000;

const server = app.listen(PORT, () => {
  logger.info(`Server is running on port ${PORT}`);
});

const gracefulShutdown = (signal) => {
  logger.info(`${signal} received. Shutting down gracefully...`);
  server.close(() => {
    logger.info('Process terminated');
    process.exit(0);
  });
};

const unexpectedErrorHandler = (error) => {
  logger.error(error);
  logger.info('Server is shutting down due to unexpected error...');
  process.exit(1);
};

process.on('unhandledRejection', unexpectedErrorHandler);
process.on('uncaughtException', unexpectedErrorHandler);
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
