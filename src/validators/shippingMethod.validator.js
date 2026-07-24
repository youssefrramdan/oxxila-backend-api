// src/validators/shippingMethod.validator.js
import { body, param } from 'express-validator';
import validate from '../middlewares/validate.middleware.js';
import { SHIPPING_METHOD_TYPES } from '../models/ShippingMethodSetting.js';

export const updateShippingMethodValidator = [
  param('type')
    .trim()
    .toLowerCase()
    .isIn(SHIPPING_METHOD_TYPES)
    .withMessage(`Type must be one of: ${SHIPPING_METHOD_TYPES.join(', ')}`),
  body('isEnabled')
    .notEmpty()
    .withMessage('isEnabled is required')
    .isBoolean()
    .withMessage('isEnabled must be a boolean')
    .toBoolean(),
  validate,
];
