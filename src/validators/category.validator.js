// src/validators/category.validator.js
import { check, param } from 'express-validator';
import validate from '../middlewares/validate.middleware.js';

const mongoId = (p) => param(p).isMongoId().withMessage(`Invalid ${p}`);

export const createCategoryValidator = [
  check('name')
    .trim()
    .notEmpty().withMessage('Category name is required')
    .isLength({ min: 2, max: 50 }).withMessage('Category name must be 2-50 characters'),
  check('image').optional().isString().isLength({ max: 2000 }),
  check('isActive').optional().isBoolean().withMessage('isActive must be a boolean'),
  validate,
];

export const updateCategoryValidator = [
  mongoId('id'),
  check('name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 }).withMessage('Category name must be 2-50 characters'),
  check('image').optional().isString().isLength({ max: 2000 }),
  check('isActive').optional().isBoolean().withMessage('isActive must be a boolean'),
  validate,
];

export const categoryIdParamValidator = [mongoId('id'), validate];
