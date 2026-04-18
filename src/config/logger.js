// src/config/logger.js
import path from 'path';
import { createLogger, format, transports } from 'winston';

const { combine, timestamp, errors, json, colorize, printf } = format;
const logsDir = path.join(process.cwd(), 'logs');

const consoleFormat = printf(
  ({ level, message, timestamp, stack }) => `${timestamp} [${level}]: ${stack ?? message}`
);

const logger = createLogger({
  level: 'info',
  format: combine(timestamp(), errors({ stack: true }), json()),
  transports: [
    new transports.Console({
      format: combine(colorize({ all: true }), timestamp({ format: 'HH:mm:ss' }), consoleFormat),
    }),
  ],
});

if (process.env.NODE_ENV !== 'production') {
  logger.add(new transports.File({ filename: path.join(logsDir, 'error.log'), level: 'error' }));
  logger.add(new transports.File({ filename: path.join(logsDir, 'combined.log') }));
}

export default logger;
