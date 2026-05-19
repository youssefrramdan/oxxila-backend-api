// src/validators/carrierPickup.validator.js
import { body, param } from 'express-validator';
import validate from '../middlewares/validate.middleware.js';

export const carrierPickupParamValidator = [
  param('id').isMongoId().withMessage('Invalid carrier ID'),
  validate,
];

export const pickupIdParamValidator = [
  param('id').isMongoId().withMessage('Invalid carrier ID'),
  param('pickupId').isMongoId().withMessage('Invalid pickup ID'),
  validate,
];

export const createPickupValidator = [
  param('id').isMongoId().withMessage('Invalid carrier ID'),
  body('locationName').notEmpty().withMessage('locationName is required'),
  body('contactPerson.name').notEmpty().withMessage('Contact name is required'),
  body('contactPerson.phone').notEmpty().withMessage('Contact phone is required'),
  body('address.firstLine').notEmpty().withMessage('address.firstLine is required'),
  body('address.city').notEmpty().withMessage('address.city is required'),
  body('address.zoneId').notEmpty().withMessage('address.zoneId is required'),
  body('address.districtId').notEmpty().withMessage('address.districtId is required'),
  body('address.cityId').optional().isString(),
  body('isDefault').optional().isBoolean(),
  validate,
];
