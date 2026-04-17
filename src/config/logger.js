// src/config/logger.js
import path from 'path';
import { createLogger, format, transports } from 'winston';

const isProduction = process.env.NODE_ENV === 'production';
const logPath = path.join(process.cwd(), 'logs');
const { combine, timestamp, errors, json, colorize, printf } = format;

const consoleFormat = printf(({ level, message, timestamp, stack }) => {
  return `${timestamp} [${level}]: ${stack ?? message}`;
});

// On platforms with ephemeral filesystems (Heroku, Render, Fly…) we keep logs
// on stdout so the platform's log drain can capture them. Locally we still
// write rotating files for easier debugging.
const logTransports = isProduction
  ? [
      new transports.Console({
        format: combine(
          timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
          errors({ stack: true }),
          json()
        ),
      }),
    ]
  : [
      new transports.File({ filename: path.join(logPath, 'error.log'), level: 'error' }),
      new transports.File({ filename: path.join(logPath, 'combined.log') }),
      new transports.Console({
        format: combine(
          colorize({ all: true }),
          timestamp({ format: 'HH:mm:ss' }),
          errors({ stack: true }),
          consoleFormat
        ),
      }),
    ];

const logger = createLogger({
  level: 'info',
  format: combine(
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    errors({ stack: true }),
    json()
  ),
  defaultMeta: { service: 'app-service' },
  transports: logTransports,
  exceptionHandlers: isProduction
    ? [new transports.Console()]
    : [new transports.File({ filename: path.join(logPath, 'exceptions.log') })],
  rejectionHandlers: isProduction
    ? [new transports.Console()]
    : [new transports.File({ filename: path.join(logPath, 'rejections.log') })],
});

export default logger;
