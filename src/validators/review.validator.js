// src/validators/review.validator.js
import { body, param } from 'express-validator';
import validate from '../middlewares/validate.middleware.js';

const productIdParam = () =>
  param('productId').isMongoId().withMessage('Invalid product ID');

const reviewIdParam = () => param('id').isMongoId().withMessage('Invalid review ID');

export const getProductReviewsValidator = [productIdParam(), validate];

export const getProductRatingStatsValidator = [productIdParam(), validate];

export const createProductReviewValidator = [
  productIdParam(),
  body('rating')
    .notEmpty()
    .withMessage('Rating is required')
    .toFloat()
    .isFloat({ min: 1, max: 5 })
    .withMessage('Rating must be between 1 and 5'),
  body('comment')
    .notEmpty()
    .withMessage('Comment is required')
    .trim()
    .isLength({ max: 1000 })
    .withMessage('Comment cannot exceed 1000 characters'),
  body('title')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Title cannot exceed 100 characters'),
  validate,
];

export const reviewIdValidator = [reviewIdParam(), validate];

export const updateReviewValidator = [
  reviewIdParam(),
  body('rating')
    .optional()
    .toFloat()
    .isFloat({ min: 1, max: 5 })
    .withMessage('Rating must be between 1 and 5'),
  body('comment')
    .optional()
    .trim()
    .isLength({ max: 1000 })
    .withMessage('Comment cannot exceed 1000 characters'),
  body('title')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Title cannot exceed 100 characters'),
  validate,
];
