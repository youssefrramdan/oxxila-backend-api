// src/validators/wishlist.validator.js
import { body, param } from 'express-validator'

export const addToWishlistValidator = [
  body('productId')
    .notEmpty().withMessage('productId is required')
    .isMongoId().withMessage('Invalid product ID'),
]

export const removeFromWishlistValidator = [
  param('productId')
    .isMongoId().withMessage('Invalid product ID'),
]
