// src/validators/cart.validator.js
import { body, param } from 'express-validator'

export const addToCartValidator = [
  body('productId')
    .notEmpty().withMessage('productId is required')
    .isMongoId().withMessage('Invalid product ID'),

  body('quantity')
    .optional()
    .isInt({ min: 1 }).withMessage('Quantity must be at least 1'),
]

export const updateCartItemValidator = [
  param('itemId')
    .isMongoId().withMessage('Invalid item ID'),

  body('quantity')
    .notEmpty().withMessage('quantity is required')
    .isInt({ min: 1 }).withMessage('Quantity must be at least 1'),
]

export const applyCouponValidator = [
  body('code')
    .notEmpty().withMessage('Coupon code is required')
    .isString().withMessage('Invalid coupon code'),
]
