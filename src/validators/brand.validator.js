// src/validators/brand.validator.js
import { check, param } from 'express-validator';
import validate from '../middlewares/validate.middleware.js';
import { normalizeBilingualNameBody } from '../utils/bilingualName.js';

const mongoId = (p) => param(p).isMongoId().withMessage(`Invalid ${p}`);

const normalizeNames = (req, _res, next) => {
  req.body = normalizeBilingualNameBody(req.body);
  next();
};

export const createBrandValidator = [
  normalizeNames,
  check('nameEn')
    .trim()
    .notEmpty()
    .withMessage('English brand name is required')
    .isLength({ min: 2, max: 50 })
    .withMessage('English brand name must be 2-50 characters'),
  check('nameAr')
    .optional({ values: 'falsy' })
    .trim()
    .isLength({ max: 50 })
    .withMessage('Arabic brand name must be at most 50 characters'),
  check('name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Brand name must be 2-50 characters'),
  check('logo').optional().isString().isLength({ max: 2000 }),
  check('description').optional().isString().isLength({ max: 500 }),
  check('category').optional().isMongoId().withMessage('Invalid category id'),
  check('isActive').optional().isBoolean().withMessage('isActive must be a boolean'),
  validate,
];

export const updateBrandValidator = [
  mongoId('id'),
  normalizeNames,
  check('nameEn')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('English brand name must be 2-50 characters'),
  check('nameAr')
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage('Arabic brand name must be at most 50 characters'),
  check('name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Brand name must be 2-50 characters'),
  check('logo').optional().isString().isLength({ max: 2000 }),
  check('description').optional().isString().isLength({ max: 500 }),
  check('category').optional().isMongoId().withMessage('Invalid category id'),
  check('isActive').optional().isBoolean().withMessage('isActive must be a boolean'),
  validate,
];

export const brandIdParamValidator = [mongoId('id'), validate];
