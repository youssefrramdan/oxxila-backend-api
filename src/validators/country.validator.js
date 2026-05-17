// src/validators/country.validator.js
import { body, param } from 'express-validator';
import validate from '../middlewares/validate.middleware.js';

const mongoId = (p) => param(p).isMongoId().withMessage(`Invalid ${p}`);

export const createCountryValidator = [
  body('name')
    .trim()
    .notEmpty().withMessage('Country name is required')
    .isLength({ max: 100 }).withMessage('Name too long'),
  body('code')
    .trim()
    .notEmpty().withMessage('Country code is required')
    .isLength({ min: 2, max: 2 }).withMessage('Code must be exactly 2 characters'),
  body('currency')
    .trim()
    .notEmpty().withMessage('Currency code is required')
    .isLength({ min: 3, max: 3 }).withMessage('Currency must be a 3-letter ISO code'),
  body('flag').optional().isString(),
  validate,
];

export const updateCountryValidator = [
  mongoId('id'),
  body('name').optional().trim().isLength({ max: 100 }).withMessage('Name too long'),
  body('code')
    .optional()
    .trim()
    .isLength({ min: 2, max: 2 }).withMessage('Code must be exactly 2 characters'),
  body('currency')
    .optional()
    .trim()
    .isLength({ min: 3, max: 3 }).withMessage('Currency must be a 3-letter ISO code'),
  body('flag').optional().isString(),
  validate,
];

export const countryIdParamValidator = [mongoId('id'), validate];
