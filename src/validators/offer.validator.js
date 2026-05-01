// src/validators/offer.validator.js
import { body, param } from 'express-validator';
import validate from '../middlewares/validate.middleware.js';

const mongoId = (p) => param(p).isMongoId().withMessage(`Invalid ${p}`);

export const createOfferValidator = [
  body('product').notEmpty().withMessage('Product is required').isMongoId().withMessage('Invalid product id'),

  body('discountPercent')
    .optional({ values: 'null' })
    .toFloat()
    .isFloat({ min: 0, max: 100 })
    .withMessage('discountPercent must be between 0 and 100'),

  body('discountAmount')
    .optional({ values: 'null' })
    .toFloat()
    .isFloat({ min: 0 })
    .withMessage('discountAmount must be >= 0'),

  body('productCount').optional({ values: 'null' }).toInt().isInt({ min: 1 }).withMessage('productCount must be >= 1'),

  body('startDate').notEmpty().withMessage('startDate is required').isISO8601().withMessage('startDate must be a valid ISO 8601 date'),

  body('endDate').notEmpty().withMessage('endDate is required').isISO8601().withMessage('endDate must be a valid ISO 8601 date'),

  validate,
];

export const updateOfferValidator = [
  mongoId('id'),

  body('product').optional({ values: 'null' }).isMongoId().withMessage('Invalid product id'),

  body('discountPercent')
    .optional({ values: 'null' })
    .toFloat()
    .isFloat({ min: 0, max: 100 })
    .withMessage('discountPercent must be between 0 and 100'),

  body('discountAmount')
    .optional({ values: 'null' })
    .toFloat()
    .isFloat({ min: 0 })
    .withMessage('discountAmount must be >= 0'),

  body('productCount').optional({ values: 'null' }).toInt().isInt({ min: 1 }).withMessage('productCount must be >= 1'),

  body('startDate').optional({ values: 'null' }).isISO8601().withMessage('startDate must be a valid ISO 8601 date'),

  body('endDate').optional({ values: 'null' }).isISO8601().withMessage('endDate must be a valid ISO 8601 date'),

  body('isActive').optional().isBoolean().withMessage('isActive must be a boolean'),

  validate,
];

export const offerIdParamValidator = [mongoId('id'), validate];
