// src/validators/subCategory.validator.js
import { check, param } from 'express-validator';
import validate from '../middlewares/validate.middleware.js';
import { normalizeBilingualNameBody } from '../utils/bilingualName.js';

const mongoId = (p) => param(p).isMongoId().withMessage(`Invalid ${p}`);

const normalizeNames = (req, _res, next) => {
  req.body = normalizeBilingualNameBody(req.body);
  next();
};

export const createSubCategoryValidator = [
  normalizeNames,
  check('category')
    .notEmpty()
    .withMessage('Category id is required')
    .isMongoId()
    .withMessage('Invalid category id'),
  check('nameEn')
    .trim()
    .notEmpty()
    .withMessage('English name is required')
    .isLength({ min: 2, max: 50 })
    .withMessage('English name must be 2-50 characters'),
  check('nameAr')
    .optional({ values: 'falsy' })
    .trim()
    .isLength({ max: 50 })
    .withMessage('Arabic name must be at most 50 characters'),
  check('name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Name must be 2-50 characters'),
  check('image').optional().isString().isLength({ max: 2000 }),
  check('isActive')
    .optional()
    .isBoolean({ strict: false })
    .withMessage('isActive must be a boolean')
    .toBoolean(),
  validate,
];

const updateSubBody = [
  normalizeNames,
  check('nameEn')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('English name must be 2-50 characters'),
  check('nameAr')
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage('Arabic name must be at most 50 characters'),
  check('name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Name must be 2-50 characters'),
  check('category').optional().isMongoId().withMessage('Invalid category id'),
  check('image').optional().isString().isLength({ max: 2000 }),
  check('isActive')
    .optional()
    .isBoolean({ strict: false })
    .withMessage('isActive must be a boolean')
    .toBoolean(),
];

export const updateSubCategoryValidatorNested = [
  mongoId('categoryId'),
  mongoId('id'),
  ...updateSubBody,
  validate,
];

export const subCategoryIdParamValidator = [mongoId('id'), validate];

export const nestedSubCategoryIdParams = [mongoId('categoryId'), mongoId('id'), validate];
