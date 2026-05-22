// src/validators/order.validator.js
import { body, param } from 'express-validator';
import validate from '../middlewares/validate.middleware.js';

const addressFields = [
  body('governorateId')
    .notEmpty()
    .withMessage('governorateId is required')
    .isMongoId()
    .withMessage('Invalid governorate ID'),

  body('districtId')
    .optional({ values: 'null' })
    .custom((value) => {
      if (value === 'other') return true;
      if (typeof value === 'string' && /^[a-f\d]{24}$/i.test(value)) return true;
      throw new Error('Invalid district ID');
    }),

  body('addressLine')
    .trim()
    .notEmpty()
    .withMessage('addressLine is required')
    .isLength({ min: 6, max: 500 })
    .withMessage('addressLine must be between 6 and 500 characters'),

  body('shippingMethodCode')
    .optional()
    .trim()
    .isIn(['standard'])
    .withMessage('Invalid shipping method'),

];

export const createOrderValidator = [
  ...addressFields,

  body('paymentMethod')
    .notEmpty()
    .withMessage('paymentMethod is required')
    .equals('cod')
    .withMessage('Only cod is supported on this endpoint. Use POST /orders/payment-session for card payments.'),

  validate,
];

export const createPaymentSessionValidator = [
  ...addressFields,

  body('provider')
    .notEmpty()
    .withMessage('provider is required')
    .isIn(['stripe', 'paymob'])
    .withMessage('provider must be stripe or paymob'),

  validate,
];

export const paymentSessionIdParamValidator = [
  param('id').isMongoId().withMessage('Invalid payment session ID'),
  validate,
];

export const orderIdParamValidator = [
  param('id').isMongoId().withMessage('Invalid order ID'),
  validate,
];

export const updateOrderStatusValidator = [
  param('id').isMongoId().withMessage('Invalid order ID'),

  body('orderStatus')
    .notEmpty()
    .withMessage('orderStatus is required')
    .isIn([
      'pending',
      'confirmed',
      'processing',
      'shipped',
      'out_for_delivery',
      'failed_attempt',
      'returned',
      'partially_returned',
      'delivered',
      'cancelled',
    ])
    .withMessage('Invalid order status'),

  validate,
];

export const refundOrderValidator = [
  param('id').isMongoId().withMessage('Invalid order ID'),
  validate,
];

export const cancelOrderValidator = [
  param('id').isMongoId().withMessage('Invalid order ID'),

  body('reason')
    .optional()
    .trim()
    .isLength({ max: 300 })
    .withMessage('reason must be at most 300 characters'),

  validate,
];
