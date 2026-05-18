// src/validators/return.validator.js
import { body, param } from 'express-validator';
import validate from '../middlewares/validate.middleware.js';
import { RETURN_REASONS } from '../utils/returnHelpers.js';

const pickupAddressFields = [
  body('pickupAddress.city').trim().notEmpty().withMessage('Pickup city is required'),
  body('pickupAddress.governorate').trim().notEmpty().withMessage('Pickup governorate is required'),
  body('pickupAddress.address')
    .trim()
    .notEmpty()
    .withMessage('Pickup address is required')
    .isLength({ min: 5, max: 500 }),
];

export const createReturnValidator = [
  body('order').notEmpty().withMessage('order is required').isMongoId().withMessage('Invalid order ID'),

  body('items')
    .isArray({ min: 1 })
    .withMessage('items must be a non-empty array'),

  body('items.*.orderItemId')
    .notEmpty()
    .withMessage('orderItemId is required for each item')
    .isMongoId()
    .withMessage('Invalid orderItemId'),

  body('items.*.quantity')
    .isInt({ min: 1 })
    .withMessage('quantity must be at least 1'),

  body('reason')
    .notEmpty()
    .withMessage('reason is required')
    .isIn(RETURN_REASONS)
    .withMessage(`reason must be one of: ${RETURN_REASONS.join(', ')}`),

  body('note').optional().trim().isLength({ max: 2000 }),

  body('returnMethod')
    .notEmpty()
    .withMessage('returnMethod is required')
    .isIn(['pickup', 'self_ship'])
    .withMessage('returnMethod must be pickup or self_ship'),

  ...pickupAddressFields,

  validate,
];

export const returnIdParamValidator = [
  param('id').isMongoId().withMessage('Invalid return request ID'),
  validate,
];

export const updateReturnStatusValidator = [
  param('id').isMongoId().withMessage('Invalid return request ID'),

  body('refundStatus')
    .notEmpty()
    .withMessage('refundStatus is required')
    .isIn(['approved', 'rejected', 'picked_up', 'received', 'refunded'])
    .withMessage('Invalid refundStatus for this action'),

  body('adminNote').optional().trim().isLength({ max: 1000 }),

  body('manualRefundNote')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('manualRefundNote is for COD manual payout notes'),

  validate,
];
