// src/validators/product.validator.js
import { check, param } from 'express-validator';
import validate from '../middlewares/validate.middleware.js';

const mongoId = (p) => param(p).isMongoId().withMessage(`Invalid ${p}`);

const CONCERNS = ['acne', 'pigmentation', 'sensitive-skin', 'drought', 'wrinkles', 'wide-pores'];

/** multipart often sends one id string — normalize before array validators */
const sanitizeSubCategoryArray = (value) => {
  if (value === undefined || value === null) return value;
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    const parts = value
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    return parts.length ? parts : value;
  }
  return value;
};

export const createProductValidator = [
  check('name')
    .trim()
    .notEmpty()
    .withMessage('Product name is required')
    .isLength({ min: 2, max: 200 })
    .withMessage('Name must be 2-200 characters'),

  check('price')
    .notEmpty()
    .withMessage('Price is required')
    .toFloat()
    .isFloat({ min: 0 })
    .withMessage('Price must be >= 0'),

  check('priceAfterDiscount')
    .optional({ values: 'null' })
    .toFloat()
    .isFloat({ min: 0 })
    .withMessage('priceAfterDiscount must be >= 0')
    .custom((val, { req }) => Number(val) < Number(req.body.price))
    .withMessage('priceAfterDiscount must be less than price'),

  check('stock')
    .notEmpty()
    .withMessage('Stock is required')
    .toInt()
    .isInt({ min: 0 })
    .withMessage('Stock must be >= 0'),

  check('category').notEmpty().withMessage('Category is required').isMongoId().withMessage('Invalid category id'),

  check('subCategory').customSanitizer(sanitizeSubCategoryArray).isArray({ min: 1 }).withMessage('subCategory must be an array with at least one id'),

  check('subCategory.*').isMongoId().withMessage('Invalid subCategory id'),

  check('brand').optional({ values: 'null' }).isMongoId().withMessage('Invalid brand id'),

  check('concerns')
    .optional()
    .custom((value) => {
      if (value === undefined || value === null) return true;
      if (!Array.isArray(value)) return false;
      return value.every((c) => CONCERNS.includes(c));
    })
    .withMessage(`Each concern must be one of: ${CONCERNS.join(', ')}`),

  check('isSensitiveSkin').optional().isBoolean().withMessage('isSensitiveSkin must be a boolean'),
  check('description').optional().trim().isLength({ max: 2000 }).withMessage('description max 2000 characters'),
  check('advantages').optional().trim().isLength({ max: 2000 }).withMessage('advantages max 2000 characters'),
  check('composition').optional().trim().isLength({ max: 2000 }).withMessage('composition max 2000 characters'),
  check('isActive').optional().isBoolean().withMessage('isActive must be a boolean'),
  validate,
];

export const updateProductValidator = [
  mongoId('id'),

  check('name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 200 })
    .withMessage('Name must be 2-200 characters'),

  check('price')
    .optional({ values: 'null' })
    .toFloat()
    .isFloat({ min: 0 })
    .withMessage('price must be >= 0'),

  check('priceAfterDiscount')
    .optional({ values: 'null' })
    .toFloat()
    .isFloat({ min: 0 })
    .withMessage('priceAfterDiscount must be >= 0')
    .custom((val, { req }) => {
      if (req.body.price === undefined || req.body.price === null || req.body.price === '') return true;
      return Number(val) < Number(req.body.price);
    })
    .withMessage('priceAfterDiscount must be less than price'),

  check('stock')
    .optional({ values: 'null' })
    .toInt()
    .isInt({ min: 0 })
    .withMessage('stock must be >= 0'),

  check('category').optional({ values: 'null' }).isMongoId().withMessage('Invalid category id'),

  check('subCategory').optional({ values: 'null' }).customSanitizer(sanitizeSubCategoryArray).isArray().withMessage('subCategory must be an array'),

  check('subCategory.*').if(check('subCategory').exists()).isMongoId().withMessage('Invalid subCategory id'),

  check('brand').optional({ values: 'null' }).isMongoId().withMessage('Invalid brand id'),

  check('concerns')
    .optional()
    .custom((value) => {
      if (value === undefined || value === null) return true;
      if (!Array.isArray(value)) return false;
      return value.every((c) => CONCERNS.includes(c));
    })
    .withMessage(`Each concern must be one of: ${CONCERNS.join(', ')}`),

  check('isSensitiveSkin').optional().isBoolean().withMessage('isSensitiveSkin must be a boolean'),
  check('description').optional().trim().isLength({ max: 2000 }).withMessage('description max 2000 characters'),
  check('advantages').optional().trim().isLength({ max: 2000 }).withMessage('advantages max 2000 characters'),
  check('composition').optional().trim().isLength({ max: 2000 }).withMessage('composition max 2000 characters'),
  check('isActive').optional().isBoolean().withMessage('isActive must be a boolean'),
  validate,
];

export const productIdParamValidator = [mongoId('id'), validate];
