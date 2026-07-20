// src/validators/paymentAdmin.validator.js
import { body, param, query } from 'express-validator';
import validate from '../middlewares/validate.middleware.js';
import { GATEWAY_CODES } from '../models/PaymentGateway.js';

export const paymentSummaryValidator = [
  query('period')
    .optional()
    .isInt({ min: 1, max: 365 })
    .withMessage('Period must be between 1 and 365 days')
    .toInt(),
  validate,
];

export const updatePaymentGatewayValidator = [
  param('code')
    .trim()
    .toLowerCase()
    .isIn(GATEWAY_CODES)
    .withMessage(`Gateway code must be one of: ${GATEWAY_CODES.join(', ')}`),
  body('isEnabled')
    .notEmpty()
    .withMessage('isEnabled is required')
    .isBoolean()
    .withMessage('isEnabled must be a boolean')
    .toBoolean(),
  validate,
];
