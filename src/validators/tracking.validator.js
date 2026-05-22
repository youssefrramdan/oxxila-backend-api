// src/validators/tracking.validator.js
import { param } from 'express-validator';
import validate from '../middlewares/validate.middleware.js';

export const trackingNumberParamValidator = [
  param('trackingNumber')
    .trim()
    .notEmpty()
    .withMessage('Tracking number is required')
    .isLength({ min: 4, max: 64 }),
  validate,
];

export const trackOrderIdParamValidator = [
  param('orderId').isMongoId().withMessage('Invalid order id'),
  validate,
];
