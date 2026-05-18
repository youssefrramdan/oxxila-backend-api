// src/validators/coupon.validator.js
import { body, param } from 'express-validator';
import validate from '../middlewares/validate.middleware.js';

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
    .isIn(['percentage', 'fixed'])
    .withMessage('Discount type must be percentage or fixed'),

  body('discountValue')
    .notEmpty()
    .withMessage('Discount value is required')
    .toFloat()
    .isFloat({ min: 0 })
    .withMessage('Discount value must be positive')
    .custom((value, { req }) => {
      if (req.body.discountType === 'percentage' && value > 100) {
        throw new Error('Percentage discount cannot exceed 100%');
      }
      return true;
    }),

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
    .isIn(['percentage', 'fixed'])
    .withMessage('Discount type must be percentage or fixed'),

  body('discountValue')
    .optional()
    .toFloat()
    .isFloat({ min: 0 })
    .withMessage('Discount value must be positive'),

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
