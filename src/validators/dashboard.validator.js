// src/validators/dashboard.validator.js
import { query } from 'express-validator';
import validate from '../middlewares/validate.middleware.js';

export const dashboardOverviewValidator = [
  query('period')
    .optional()
    .isInt({ min: 1, max: 365 })
    .withMessage('Period must be between 1 and 365 days')
    .toInt(),

  query('limit')
    .optional()
    .isInt({ min: 1, max: 50 })
    .withMessage('Limit must be between 1 and 50')
    .toInt(),

  query('lowStockThreshold')
    .optional()
    .isInt({ min: 1, max: 1000 })
    .withMessage('Low stock threshold must be between 1 and 1000')
    .toInt(),

  validate,
];

export const dashboardRevenueValidator = [
  query('period')
    .optional()
    .isInt({ min: 1, max: 365 })
    .withMessage('Period must be between 1 and 365 days')
    .toInt(),
  query('interval')
    .optional()
    .isIn(['daily', 'weekly'])
    .withMessage('Interval must be daily or weekly'),
  validate,
];
