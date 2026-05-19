// src/validators/bosta.validator.js
import { body, param } from 'express-validator';
import validate from '../middlewares/validate.middleware.js';

const PACKAGE_TYPES = ['Parcel', 'Document', 'Bulky'];
const PACKAGE_SIZES = ['SMALL', 'MEDIUM', 'LARGE', 'LIGHT_BULKY', 'HEAVY_BULKY'];

export const createBostaShipmentValidator = [
  param('orderId').isMongoId().withMessage('Invalid order ID'),

  body('notes').optional().trim().isLength({ max: 500 }).withMessage('Notes too long'),

  body('packageType')
    .optional()
    .isIn(PACKAGE_TYPES)
    .withMessage(`packageType must be one of: ${PACKAGE_TYPES.join(', ')}`),

  body('size')
    .optional()
    .isIn(PACKAGE_SIZES)
    .withMessage(`size must be one of: ${PACKAGE_SIZES.join(', ')}`),

  body('itemsCount')
    .optional()
    .isInt({ min: 1, max: 999 })
    .withMessage('itemsCount must be between 1 and 999'),

  body('description')
    .optional()
    .trim()
    .isLength({ min: 1, max: 500 })
    .withMessage('description must be 1–500 characters'),

  body('pickupAddress.city').optional().trim().notEmpty(),
  body('pickupAddress.zone').optional().trim(),
  body('pickupAddress.districtId').optional().trim(),
  body('pickupAddress.districtName').optional().trim(),
  body('pickupAddress.firstLine').optional().trim().notEmpty(),
  body('pickupAddress.secondLine').optional().trim(),

  body('dropOffAddress.city').optional().trim().notEmpty(),
  body('dropOffAddress.zone').optional().trim(),
  body('dropOffAddress.districtId').optional().trim(),
  body('dropOffAddress.districtName').optional().trim(),
  body('dropOffAddress.firstLine').optional().trim().notEmpty(),
  body('dropOffAddress.secondLine').optional().trim(),

  validate,
];
