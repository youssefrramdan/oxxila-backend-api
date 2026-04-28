// src/validators/brand.validator.js
import { body, param } from 'express-validator';
import validate from '../middlewares/validate.middleware.js';

const mongoId = (p) => param(p).isMongoId().withMessage(`Invalid ${p}`);

export const createBrandValidator = [
  body('name')
    .trim()
    .notEmpty().withMessage('Brand name is required')
    .isLength({ min: 2, max: 50 }).withMessage('Brand name must be 2-50 characters'),
  body('logo').optional().isString().isLength({ max: 2000 }),
  body('description').optional().isString().isLength({ max: 500 }),
  body('isActive').optional().isBoolean().withMessage('isActive must be a boolean'),
  validate,
];

export const updateBrandValidator = [
  mongoId('id'),
  body('name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 }).withMessage('Brand name must be 2-50 characters'),
  body('logo').optional().isString().isLength({ max: 2000 }),
  body('description').optional().isString().isLength({ max: 500 }),
  body('isActive').optional().isBoolean().withMessage('isActive must be a boolean'),
  validate,
];

export const brandIdParamValidator = [mongoId('id'), validate];
