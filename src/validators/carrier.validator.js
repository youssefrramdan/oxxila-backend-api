// src/validators/carrier.validator.js
import { body, param } from 'express-validator';
import validate from '../middlewares/validate.middleware.js';

const mongoId = (p) => param(p).isMongoId().withMessage(`Invalid ${p}`);

export const createCarrierValidator = [
  body('name')
    .trim()
    .notEmpty().withMessage('Carrier name is required')
    .isLength({ max: 100 }).withMessage('Name too long'),
  body('code')
    .trim()
    .notEmpty().withMessage('Carrier code is required')
    .isLength({ max: 10 }).withMessage('Code too long'),
  body('type')
    .notEmpty().withMessage('Type is required')
    .isIn(['known', 'internal']).withMessage('Type must be known or internal'),
  body('deliveryDays')
    .notEmpty().withMessage('Delivery days is required'),
  body('logo').optional().isString(),
  validate,
];

export const updateCarrierValidator = [
  mongoId('id'),
  body('name').optional().trim().isLength({ max: 100 }).withMessage('Name too long'),
  body('deliveryDays').optional().isString(),
  body('logo').optional().isString(),
  body('isActive').optional().isBoolean().withMessage('isActive must be a boolean'),
  validate,
];

export const updateCoverageValidator = [
  mongoId('id'),
  body('governorateIds')
    .isArray().withMessage('governorateIds must be an array'),
  body('governorateIds.*')
    .isMongoId().withMessage('Each governorate ID must be valid'),
  validate,
];

export const carrierIdParamValidator = [mongoId('id'), validate];
