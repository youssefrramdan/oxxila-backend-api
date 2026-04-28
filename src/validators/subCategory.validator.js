// src/validators/subCategory.validator.js
import { check, param } from 'express-validator';
import validate from '../middlewares/validate.middleware.js';

const mongoId = (p) => param(p).isMongoId().withMessage(`Invalid ${p}`);

export const createSubCategoryValidator = [
  check('category')
    .notEmpty().withMessage('Category id is required')
    .isMongoId().withMessage('Invalid category id'),
  check('name')
    .trim()
    .notEmpty().withMessage('Name is required')
    .isLength({ min: 2, max: 50 }).withMessage('Name must be 2-50 characters'),
  check('image').optional().isString().isLength({ max: 2000 }),
  check('isActive').optional().isBoolean().withMessage('isActive must be a boolean'),
  validate,
];

const updateSubBody = [
  check('name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 }).withMessage('Name must be 2-50 characters'),
  check('category')
    .optional()
    .isMongoId().withMessage('Invalid category id'),
  check('image').optional().isString().isLength({ max: 2000 }),
  check('isActive').optional().isBoolean().withMessage('isActive must be a boolean'),
];

export const updateSubCategoryValidatorNested = [mongoId('categoryId'), mongoId('id'), ...updateSubBody, validate];

export const subCategoryIdParamValidator = [mongoId('id'), validate];

export const nestedSubCategoryIdParams = [mongoId('categoryId'), mongoId('id'), validate];
