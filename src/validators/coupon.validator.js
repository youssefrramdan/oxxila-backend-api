// src/validators/coupon.validator.js
import { body, param } from 'express-validator';
import validate from '../middlewares/validate.middleware.js';
import { COUPON_DISCOUNT_TYPES } from '../models/Coupon.js';

const discountTypeMessage = `Discount type must be one of: ${COUPON_DISCOUNT_TYPES.join(', ')}`;

const normalizeDiscountValue = (optional) =>
  body('discountValue')
    .customSanitizer((value, { req }) => {
      if (req.body.discountType === 'freeShipping') return 0;
      return value;
    })
    .custom((value, { req }) => {
      if (req.body.discountType === 'freeShipping') return true;
      if (optional && (value === undefined || value === null || value === '')) return true;
      if (value === undefined || value === null || value === '') {
        throw new Error('Discount value is required');
      }
      const num = Number(value);
      if (!Number.isFinite(num) || num < 0) {
        throw new Error('Discount value must be positive');
      }
      if (req.body.discountType === 'percentage' && num > 100) {
        throw new Error('Percentage discount cannot exceed 100%');
      }
      return true;
    })
    .customSanitizer((value, { req }) => {
      if (req.body.discountType === 'freeShipping') return 0;
      if (value === undefined || value === null || value === '') return value;
      return Number(value);
    });

export const createCouponValidator = [
  body('code')
    .notEmpty()
    .withMessage('Coupon code is required')
    .isLength({ min: 3, max: 20 })
    .withMessage('Code must be 3-20 characters')
    .matches(/^[A-Za-z0-9_-]+$/)
    .withMessage('Code can only contain letters, numbers, - and _'),

  body('discountType')
    .notEmpty()
    .withMessage('Discount type is required')
    .isIn(COUPON_DISCOUNT_TYPES)
    .withMessage(discountTypeMessage),

  normalizeDiscountValue(false),

  body('maxUsage')
    .optional({ values: 'null' })
    .toInt()
    .isInt({ min: 1 })
    .withMessage('Max usage must be at least 1'),

  body('expiresAt')
    .optional({ values: 'null' })
    .isISO8601()
    .withMessage('Expiry date must be a valid date')
    .custom((value) => {
      if (value && new Date(value) <= new Date()) {
        throw new Error('Expiry date must be in the future');
      }
      return true;
    }),

  body('minOrderAmount')
    .optional()
    .toFloat()
    .isFloat({ min: 0 })
    .withMessage('Minimum order amount must be positive'),

  validate,
];

export const updateCouponValidator = [
  param('id').isMongoId().withMessage('Invalid coupon ID'),

  body('code')
    .optional()
    .isLength({ min: 3, max: 20 })
    .withMessage('Code must be 3-20 characters')
    .matches(/^[A-Za-z0-9_-]+$/)
    .withMessage('Code can only contain letters, numbers, - and _'),

  body('discountType')
    .optional()
    .isIn(COUPON_DISCOUNT_TYPES)
    .withMessage(discountTypeMessage),

  normalizeDiscountValue(true),

  body('maxUsage')
    .optional({ values: 'null' })
    .toInt()
    .isInt({ min: 1 })
    .withMessage('Max usage must be at least 1'),

  body('expiresAt')
    .optional({ values: 'null' })
    .isISO8601()
    .withMessage('Expiry date must be a valid date')
    .custom((value) => {
      if (value && new Date(value) <= new Date()) {
        throw new Error('Expiry date must be in the future');
      }
      return true;
    }),

  body('minOrderAmount')
    .optional()
    .toFloat()
    .isFloat({ min: 0 })
    .withMessage('Minimum order amount must be positive'),

  body('isActive').optional().isBoolean().withMessage('isActive must be a boolean'),

  validate,
];

export const couponIdValidator = [param('id').isMongoId().withMessage('Invalid coupon ID'), validate];
