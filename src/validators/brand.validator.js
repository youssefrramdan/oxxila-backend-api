// src/validators/brand.validator.js
import { check, param } from 'express-validator';
import validate from '../middlewares/validate.middleware.js';

const mongoId = (p) => param(p).isMongoId().withMessage(`Invalid ${p}`);

export const createBrandValidator = [
  check('name')
    .trim()
    .notEmpty().withMessage('Brand name is required')
    .isLength({ min: 2, max: 50 }).withMessage('Brand name must be 2-50 characters'),
  check('logo').optional().isString().isLength({ max: 2000 }),
  check('description').optional().isString().isLength({ max: 500 }),
  check('category').optional().isMongoId().withMessage('Invalid category id'),
  check('isActive').optional().isBoolean().withMessage('isActive must be a boolean'),
  validate,
];

export const updateBrandValidator = [
  mongoId('id'),
  check('name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 }).withMessage('Brand name must be 2-50 characters'),
  check('logo').optional().isString().isLength({ max: 2000 }),
  check('description').optional().isString().isLength({ max: 500 }),
  check('category').optional().isMongoId().withMessage('Invalid category id'),
  check('isActive').optional().isBoolean().withMessage('isActive must be a boolean'),
  validate,
];
export const brandIdParamValidator = [mongoId('id'), validate];
