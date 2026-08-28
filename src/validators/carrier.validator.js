// src/validators/carrier.validator.js
import { body, param } from 'express-validator';
import validate from '../middlewares/validate.middleware.js';

const nonApiCarrier = body('type').not().equals('api');

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
    .isIn(['bosta']).withMessage('apiProvider must be bosta'),

  body('apiKey')
    .if(body('type').equals('api'))
    .notEmpty().withMessage('apiKey is required for API carriers'),

  body('apiBaseUrl')
    .if(body('type').equals('api'))
    .optional()
    .isString(),

  body('deliveryDaysMin')
    .if(nonApiCarrier)
    .optional()
    .isInt({ min: 0 }).withMessage('deliveryDaysMin must be a non-negative integer')
    .toInt(),

  body('deliveryDaysMax')
    .if(nonApiCarrier)
    .optional()
    .isInt({ min: 0 }).withMessage('deliveryDaysMax must be a non-negative integer')
    .toInt(),

  body('deliveryDays')
    .if(nonApiCarrier)
    .optional()
    .isString(),

  body().custom((_, { req }) => {
    if (req.body.type === 'api') return true;

    const hasRange =
      req.body.deliveryDaysMin != null &&
      req.body.deliveryDaysMax != null &&
      String(req.body.deliveryDaysMin) !== '' &&
      String(req.body.deliveryDaysMax) !== '';
    const hasLegacy =
      typeof req.body.deliveryDays === 'string' && req.body.deliveryDays.trim();

    if (!hasRange && !hasLegacy) {
      throw new Error('deliveryDaysMin and deliveryDaysMax are required for non-API carriers');
    }

    return true;
  }),

  validate,
];

export const updateCarrierValidator = [
  param('id').isMongoId().withMessage('Invalid carrier ID'),
  body('name').optional().isLength({ max: 100 }).withMessage('Name too long'),
  body('deliveryDaysMin')
    .optional()
    .isInt({ min: 0 }).withMessage('deliveryDaysMin must be a non-negative integer')
    .toInt(),
  body('deliveryDaysMax')
    .optional()
    .isInt({ min: 0 }).withMessage('deliveryDaysMax must be a non-negative integer')
    .toInt(),
  body('deliveryDays').optional().isString(),
  body('apiKey').optional().isString(),
  body('apiBaseUrl').optional().isString(),
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
