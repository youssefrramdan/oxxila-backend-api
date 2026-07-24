// src/validators/review.validator.js
import { body, param, query } from 'express-validator';
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

export const adminReviewsListValidator = [
  query('tab')
    .optional()
    .isIn(['all', 'visible', 'hidden', 'flagged'])
    .withMessage('Tab must be all, visible, hidden, or flagged'),
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be at least 1').toInt(),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100')
    .toInt(),
  query('keyword').optional().trim().isLength({ max: 200 }).withMessage('Keyword is too long'),
  validate,
];

export const adminReviewsOverviewValidator = [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be at least 1').toInt(),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100')
    .toInt(),
  query('queuePage')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Queue page must be at least 1')
    .toInt(),
  query('queueLimit')
    .optional()
    .isInt({ min: 1, max: 50 })
    .withMessage('Queue limit must be between 1 and 50')
    .toInt(),
  query('tab')
    .optional()
    .isIn(['all', 'visible', 'hidden', 'flagged'])
    .withMessage('Tab must be all, visible, hidden, or flagged'),
  validate,
];

export const adminFlaggedQueueValidator = [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be at least 1').toInt(),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100')
    .toInt(),
  validate,
];

export const updateReviewVisibilityValidator = [
  reviewIdParam(),
  body('isVisible')
    .notEmpty()
    .withMessage('isVisible is required')
    .isBoolean()
    .withMessage('isVisible must be a boolean')
    .toBoolean(),
  validate,
];

export const updateReviewFlagValidator = [
  reviewIdParam(),
  body('isFlagged')
    .notEmpty()
    .withMessage('isFlagged is required')
    .isBoolean()
    .withMessage('isFlagged must be a boolean')
    .toBoolean(),
  validate,
];
