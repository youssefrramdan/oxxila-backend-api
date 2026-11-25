// src/validators/category.validator.js
import { check, param } from 'express-validator';
import validate from '../middlewares/validate.middleware.js';
import { normalizeBilingualNameBody } from '../utils/bilingualName.js';

const mongoId = (p) => param(p).isMongoId().withMessage(`Invalid ${p}`);

const normalizeNames = (req, _res, next) => {
  req.body = normalizeBilingualNameBody(req.body);
  next();
};

export const createCategoryValidator = [
  normalizeNames,
  check('nameEn')
    .trim()
    .notEmpty()
    .withMessage('English category name is required')
    .isLength({ min: 2, max: 50 })
    .withMessage('English category name must be 2-50 characters'),
  check('nameAr')
    .optional({ values: 'falsy' })
    .trim()
    .isLength({ max: 50 })
    .withMessage('Arabic category name must be at most 50 characters'),
  check('name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Category name must be 2-50 characters'),
  check('image').optional().isString().isLength({ max: 2000 }),
  check('isActive')
    .optional()
    .isBoolean({ strict: false })
    .withMessage('isActive must be a boolean')
    .toBoolean(),
  validate,
];

export const updateCategoryValidator = [
  mongoId('id'),
  normalizeNames,
  check('nameEn')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('English category name must be 2-50 characters'),
  check('nameAr')
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage('Arabic category name must be at most 50 characters'),
  check('name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Category name must be 2-50 characters'),
  check('image').optional().isString().isLength({ max: 2000 }),
  check('isActive')
    .optional()
    .isBoolean({ strict: false })
    .withMessage('isActive must be a boolean')
    .toBoolean(),
  validate,
];

export const categoryIdParamValidator = [mongoId('id'), validate];
