// src/validators/district.validator.js
import { body, param } from 'express-validator';
import validate from '../middlewares/validate.middleware.js';

const mongoId = (p) => param(p).isMongoId().withMessage(`Invalid ${p}`);

export const createDistrictValidator = [
  body('governorate')
    .notEmpty().withMessage('Governorate ID is required')
    .isMongoId().withMessage('Invalid governorate ID'),
  body('name')
    .trim()
    .notEmpty().withMessage('District name is required')
    .isLength({ max: 100 }).withMessage('Name too long'),
  body('shippingPrice')
    .notEmpty().withMessage('Shipping price is required')
    .isFloat({ min: 0 }).withMessage('Price must be a positive number'),
  validate,
];

export const updateDistrictValidator = [
  mongoId('id'),
  body('name').optional().trim().isLength({ max: 100 }).withMessage('Name too long'),
  body('shippingPrice')
    .optional()
    .isFloat({ min: 0 }).withMessage('Price must be a positive number'),
  body('isCovered').optional().isBoolean().withMessage('isCovered must be true or false'),
  validate,
];

export const districtIdParamValidator = [mongoId('id'), validate];
