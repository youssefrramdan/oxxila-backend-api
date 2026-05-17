// src/validators/governorate.validator.js
import { body, param } from 'express-validator';
import validate from '../middlewares/validate.middleware.js';

const mongoId = (p) => param(p).isMongoId().withMessage(`Invalid ${p}`);

export const createGovernorateValidator = [
  body('country')
    .notEmpty().withMessage('Country ID is required')
    .isMongoId().withMessage('Invalid country ID'),
  body('name')
    .trim()
    .notEmpty().withMessage('Governorate name is required')
    .isLength({ max: 100 }).withMessage('Name too long'),
  body('shippingPrice')
    .notEmpty().withMessage('Shipping price is required')
    .isFloat({ min: 0 }).withMessage('Price must be a positive number'),
  validate,
];

export const updateGovernorateValidator = [
  mongoId('id'),
  body('name').optional().trim().isLength({ max: 100 }).withMessage('Name too long'),
  body('shippingPrice')
    .optional()
    .isFloat({ min: 0 }).withMessage('Price must be a positive number'),
  validate,
];

export const governorateIdParamValidator = [mongoId('id'), validate];
