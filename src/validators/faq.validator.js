// src/validators/faq.validator.js
import { body, param } from 'express-validator';
import validate from '../middlewares/validate.middleware.js';

const productIdParam = () =>
  param('productId').isMongoId().withMessage('Invalid product ID');

const faqIdParam = () => param('id').isMongoId().withMessage('Invalid FAQ ID');

export const getProductFaqsValidator = [productIdParam(), validate];

export const createProductFaqValidator = [
  productIdParam(),
  body('question')
    .notEmpty()
    .withMessage('Question is required')
    .trim()
    .isLength({ max: 300 })
    .withMessage('Question cannot exceed 300 characters'),
  body('answer')
    .notEmpty()
    .withMessage('Answer is required')
    .trim()
    .isLength({ max: 1000 })
    .withMessage('Answer cannot exceed 1000 characters'),
  body('isActive').optional().isBoolean().withMessage('isActive must be a boolean'),
  validate,
];

export const askSpecialistValidator = [
  productIdParam(),
  body('question')
    .notEmpty()
    .withMessage('Question is required')
    .trim()
    .isLength({ max: 300 })
    .withMessage('Question cannot exceed 300 characters'),
  validate,
];

export const faqIdValidator = [faqIdParam(), validate];

export const updateFaqValidator = [
  faqIdParam(),
  body('question')
    .optional()
    .trim()
    .isLength({ max: 300 })
    .withMessage('Question cannot exceed 300 characters'),
  body('answer')
    .optional()
    .trim()
    .isLength({ max: 1000 })
    .withMessage('Answer cannot exceed 1000 characters'),
  body('isActive').optional().isBoolean().withMessage('isActive must be a boolean'),
  validate,
];
