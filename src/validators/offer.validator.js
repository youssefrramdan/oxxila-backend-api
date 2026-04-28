// src/validators/offer.validator.js
import { body, param } from 'express-validator';
import validate from '../middlewares/validate.middleware.js';

const mongoId = (p) => param(p).isMongoId().withMessage(`Invalid ${p}`);

export const createOfferValidator = [
  body('product').isMongoId().withMessage('Invalid product id'),
  body('discountPercent')
    .optional({ nullable: true })
    .isFloat({ min: 0, max: 100 })
    .withMessage('discountPercent must be between 0 and 100'),
  body('discountAmount')
    .optional({ nullable: true })
    .isFloat({ min: 0 })
    .withMessage('discountAmount must be a non-negative number'),
  body()
    .custom((_v, { req }) => {
      const { discountPercent, discountAmount } = req.body;
      const hasPct = discountPercent != null && discountPercent !== '';
      const hasAmt = discountAmount != null && discountAmount !== '';
      if (!hasPct && !hasAmt) {
        throw new Error('Either discountPercent or discountAmount is required');
      }
      return true;
    }),
  body('productCount')
    .optional({ nullable: true })
    .custom((value) => {
      if (value === null || value === undefined) return true;
      const n = Number(value);
      if (Number.isInteger(n) && n >= 1) return true;
      throw new Error('productCount must be at least 1 when provided');
    }),
  body('startDate').isISO8601().withMessage('startDate must be a valid ISO 8601 date'),
  body('endDate').isISO8601().withMessage('endDate must be a valid ISO 8601 date'),
  body()
    .custom((_v, { req }) => {
      const start = new Date(req.body.startDate);
      const end = new Date(req.body.endDate);
      if (end <= start) throw new Error('endDate must be after startDate');
      return true;
    }),
  validate,
];

export const updateOfferValidator = [
  mongoId('id'),
  body('discountPercent')
    .optional({ nullable: true })
    .isFloat({ min: 0, max: 100 })
    .withMessage('discountPercent must be between 0 and 100'),
  body('discountAmount')
    .optional({ nullable: true })
    .isFloat({ min: 0 })
    .withMessage('discountAmount must be a non-negative number'),
  body('productCount')
    .optional({ nullable: true })
    .custom((value) => {
      if (value === null || value === undefined) return true;
      const n = Number(value);
      if (Number.isInteger(n) && n >= 1) return true;
      throw new Error('productCount must be at least 1 when provided');
    }),
  body('startDate').optional({ nullable: true }).isISO8601(),
  body('endDate').optional({ nullable: true }).isISO8601(),
  body('isActive').optional({ nullable: true }).isBoolean().withMessage('isActive must be a boolean'),
  validate,
];

export const offerIdParamValidator = [mongoId('id'), validate];
