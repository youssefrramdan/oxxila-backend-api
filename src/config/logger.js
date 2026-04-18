// src/config/logger.js
import path from 'path';
import { createLogger, format, transports } from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';

const { combine, timestamp, errors, json, colorize, printf } = format;
const isProduction = process.env.NODE_ENV === 'production';
const logsDir = path.join(process.cwd(), 'logs');

const devFormat = printf(
  ({ level, message, timestamp, stack }) => `${timestamp} [${level}]: ${stack ?? message}`
);

const logger = createLogger({
  level: isProduction ? 'info' : 'debug',
  format: combine(timestamp(), errors({ stack: true }), json()),
  transports: [
    new transports.Console({
      format: isProduction
        ? json()
        : combine(colorize({ all: true }), timestamp({ format: 'HH:mm:ss' }), devFormat),
    }),
  ],
});

if (!isProduction) {
  const rotateOptions = { datePattern: 'YYYY-MM-DD', maxSize: '20m', maxFiles: '14d' };
  logger.add(new DailyRotateFile({
    filename: path.join(logsDir, 'error-%DATE%.log'),
    level: 'error',
    ...rotateOptions,
  }));
  logger.add(new DailyRotateFile({
    filename: path.join(logsDir, 'combined-%DATE%.log'),
    ...rotateOptions,
  }));
}

export default logger;
