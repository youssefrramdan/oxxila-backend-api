// src/validators/shipping.validator.js
import { query } from 'express-validator';
import validate from '../middlewares/validate.middleware.js';

export const shippingPriceQueryValidator = [
  query('governorateId')
    .notEmpty()
    .withMessage('governorateId is required')
    .isMongoId()
    .withMessage('Invalid governorate ID'),

  query('districtId')
    .optional({ values: 'null' })
    .custom((value) => {
      if (value === 'other' || !value) return true;
      if (typeof value === 'string' && /^[a-f\d]{24}$/i.test(value)) return true;
      throw new Error('Invalid district ID');
    }),

  validate,
];
