// src/validators/order.validator.js
import { body, param } from 'express-validator';
import validate from '../middlewares/validate.middleware.js';
import ApiError from '../utils/apiError.js';

const inlineAddressFields = [
  body('governorateId')
    .optional()
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
    .optional()
    .trim()
    .isLength({ min: 6, max: 500 })
    .withMessage('addressLine must be between 6 and 500 characters'),
];

const checkoutAddressExtras = [
  body('addressId').optional().isMongoId().withMessage('Invalid address ID'),
  body('saveAddress').optional().isBoolean().withMessage('saveAddress must be a boolean'),
  body('label').optional().trim().isLength({ max: 50 }).withMessage('Label is too long'),
  body('setAsDefault').optional().isBoolean().withMessage('setAsDefault must be a boolean'),
];

const ensureCheckoutAddress = (req, res, next) => {
  const { addressId, governorateId, addressLine, saveAddress } = req.body;

  if (addressId) {
    if (governorateId || addressLine || req.body.districtId || req.body.saveAddress) {
      return next(
        new ApiError('When addressId is provided, omit inline address fields and saveAddress', 400)
      );
    }
    return next();
  }

  if (!governorateId || !String(addressLine || '').trim()) {
    return next(new ApiError('Provide addressId or governorateId + addressLine', 400));
  }

  if (saveAddress && !req.user?.phone?.trim()) {
    return next(
      new ApiError('Add your phone number in account settings before saving an address', 400)
    );
  }

  next();
};

export const createOrderValidator = [
  ...inlineAddressFields,
  ...checkoutAddressExtras,

  body('paymentMethod')
    .notEmpty()
    .withMessage('paymentMethod is required')
    .equals('cod')
    .withMessage('Only cod is supported on this endpoint. Use POST /orders/payment-session for card payments.'),

  validate,
  ensureCheckoutAddress,
];

export const createPaymentSessionValidator = [
  ...inlineAddressFields,
  ...checkoutAddressExtras,

  body('provider')
    .notEmpty()
    .withMessage('provider is required')
    .isIn(['stripe', 'paymob'])
    .withMessage('provider must be stripe or paymob'),

  validate,
  ensureCheckoutAddress,
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

export const createOrderB2BValidator = [
  body('customerName')
    .trim()
    .notEmpty()
    .withMessage('customerName is required')
    .isLength({ min: 2, max: 100 })
    .withMessage('customerName must be between 2 and 100 characters'),

  body('items')
    .isArray({ min: 1 })
    .withMessage('items must be a non-empty array'),

  body('items.*.productId')
    .notEmpty()
    .withMessage('productId is required')
    .isMongoId()
    .withMessage('Invalid product ID'),

  body('items.*.quantity')
    .notEmpty()
    .withMessage('quantity is required')
    .toInt()
    .isInt({ min: 1 })
    .withMessage('quantity must be at least 1'),

  body('items.*.unitPrice')
    .optional()
    .toFloat()
    .isFloat({ min: 0 })
    .withMessage('unitPrice must be >= 0'),

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

  body('couponCode')
    .optional({ values: 'null' })
    .trim()
    .isLength({ min: 3, max: 20 })
    .withMessage('couponCode must be 3-20 characters'),

  body('freeShipping')
    .optional()
    .isBoolean()
    .withMessage('freeShipping must be a boolean')
    .toBoolean(),

  body('paymentMethod')
    .optional()
    .equals('cod')
    .withMessage('B2B orders currently support paymentMethod: cod only'),

  body('markPaid')
    .optional()
    .isBoolean()
    .withMessage('markPaid must be a boolean')
    .toBoolean(),

  validate,
];
