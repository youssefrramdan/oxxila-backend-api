// src/validators/carrier.validator.js
import { body, param } from 'express-validator';
import validate from '../middlewares/validate.middleware.js';

export const createCarrierValidator = [
  body('name')
    .notEmpty().withMessage('Carrier name is required')
    .isLength({ max: 100 }).withMessage('Name too long'),

  body('code')
    .notEmpty().withMessage('Carrier code is required')
    .isLength({ max: 10 }).withMessage('Code too long'),

  body('type')
    .notEmpty().withMessage('Type is required')
    .isIn(['api', 'known', 'internal']).withMessage('Type must be api, known, or internal'),

  body('apiProvider')
    .if(body('type').equals('api'))
    .notEmpty().withMessage('apiProvider is required for API carriers')
    .isIn(['bosta', 'mylerz']).withMessage('apiProvider must be bosta or mylerz'),

  body('apiKey')
    .if(body('type').equals('api'))
    .notEmpty().withMessage('apiKey is required for API carriers'),

  body('deliveryDays')
    .if(body('type').not().equals('api'))
    .notEmpty().withMessage('deliveryDays is required for non-API carriers'),

  validate,
];

export const updateCarrierValidator = [
  param('id').isMongoId().withMessage('Invalid carrier ID'),
  body('name').optional().isLength({ max: 100 }).withMessage('Name too long'),
  body('deliveryDays').optional().isString(),
  body('apiKey').optional().isString(),
  body('isActive').optional().isBoolean(),
  validate,
];

export const updateCoverageValidator = [
  param('id').isMongoId().withMessage('Invalid carrier ID'),
  body('governorateIds')
    .isArray().withMessage('governorateIds must be an array'),
  body('governorateIds.*')
    .isMongoId().withMessage('Each governorate ID must be valid'),
  validate,
];

export const carrierIdParamValidator = [
  param('id').isMongoId().withMessage('Invalid carrier ID'),
  validate,
];
