// src/validators/user.validator.js
import { body, param } from 'express-validator';
import mongoose from 'mongoose';
import validate from '../middlewares/validate.middleware.js';
import ApiError from '../utils/apiError.js';

const objectId = (field, location = 'params') => {
  const runner = location === 'body' ? body(field) : param(field);
  return runner.custom((v) => mongoose.Types.ObjectId.isValid(v))
    .withMessage('Invalid id');
};

const passwordRule = (field) =>
  body(field)
    .isString()
    .isLength({ min: 8, max: 128 })
    .withMessage('Password must be 8-128 characters');

export const createUserValidator = [
  body('name')
    .trim()
    .notEmpty().withMessage('Name is required')
    .isLength({ min: 2, max: 60 }).withMessage('Name must be 2-60 characters'),
  body('email')
    .trim()
    .isEmail().withMessage('Valid email is required')
    .normalizeEmail(),
  passwordRule('password'),
  body('role').optional().isIn(['user', 'admin']).withMessage('Invalid role'),
  body('adminTitle')
    .optional({ values: 'null' })
    .trim()
    .isLength({ max: 80 })
    .withMessage('Admin title cannot exceed 80 characters'),
  validate,
];

export const updateUserValidator = [
  objectId('id'),
  body('name').optional().trim().isLength({ min: 2, max: 60 }),
  body('email').optional().trim().isEmail().normalizeEmail(),
  body('role').optional().isIn(['user', 'admin']),
  body('adminTitle')
    .optional({ values: 'null' })
    .trim()
    .isLength({ max: 80 })
    .withMessage('Admin title cannot exceed 80 characters'),
  body('active').optional().isBoolean(),
  validate,
];

export const userIdParamValidator = [objectId('id'), validate];

export const changeUserPasswordValidator = [
  objectId('id'),
  passwordRule('password'),
  validate,
];

export const updateMeValidator = [
  body('name').optional().trim().isLength({ min: 2, max: 60 }),
  body('email').optional().trim().isEmail().withMessage('Valid email is required').normalizeEmail(),
  body('phone').optional().trim().isLength({ max: 30 }).withMessage('Phone is too long'),
  validate,
];

export const updateMyPasswordValidator = [
  body('oldPassword').notEmpty().withMessage('Old password is required'),
  passwordRule('newPassword'),
  validate,
];

const districtIdRule = (chain) =>
  chain
    .optional({ values: 'null' })
    .custom((value) => {
      if (value === 'other') return true;
      if (typeof value === 'string' && /^[a-f\d]{24}$/i.test(value)) return true;
      throw new Error('Invalid district ID');
    });

const addressGeoFields = {
  governorateId: (chain) =>
    chain
      .notEmpty()
      .withMessage('governorateId is required')
      .isMongoId()
      .withMessage('Invalid governorate ID'),
  districtId: districtIdRule,
  addressLine: (chain) =>
    chain
      .trim()
      .notEmpty()
      .withMessage('addressLine is required')
      .isLength({ min: 6, max: 500 })
      .withMessage('addressLine must be between 6 and 500 characters'),
  label: (chain) =>
    chain.optional().trim().isLength({ max: 50 }).withMessage('Label is too long'),
  isDefault: (chain) => chain.optional().isBoolean().withMessage('isDefault must be a boolean'),
};

export const addMyAddressValidator = [
  addressGeoFields.governorateId(body('governorateId')),
  addressGeoFields.districtId(body('districtId')),
  addressGeoFields.addressLine(body('addressLine')),
  addressGeoFields.label(body('label')),
  addressGeoFields.isDefault(body('isDefault')),
  validate,
];

export const updateMyAddressValidator = [
  objectId('addressId'),
  body('governorateId').optional().isMongoId().withMessage('Invalid governorate ID'),
  addressGeoFields.districtId(body('districtId')),
  body('addressLine')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('addressLine cannot be empty')
    .isLength({ min: 6, max: 500 })
    .withMessage('addressLine must be between 6 and 500 characters'),
  addressGeoFields.label(body('label')),
  addressGeoFields.isDefault(body('isDefault')),
  validate,
  (req, res, next) => {
    const { governorateId, districtId, addressLine, label, isDefault } = req.body;
    if ([governorateId, districtId, addressLine, label, isDefault].every((v) => v === undefined)) {
      return next(new ApiError('Provide at least one field to update', 400));
    }
    next();
  },
];

export const myAddressIdParamValidator = [objectId('addressId'), validate];
