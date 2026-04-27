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
  validate,
];

export const updateUserValidator = [
  objectId('id'),
  body('name').optional().trim().isLength({ min: 2, max: 60 }),
  body('email').optional().trim().isEmail().normalizeEmail(),
  body('role').optional().isIn(['user', 'admin']),
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

const addressFields = {
  city: (chain) => chain
    .trim()
    .notEmpty().withMessage('City is required')
    .isLength({ max: 100 }).withMessage('City is too long'),
  address: (chain) => chain
    .trim()
    .notEmpty().withMessage('Address is required')
    .isLength({ max: 500 }).withMessage('Address is too long'),
};

export const addMyAddressValidator = [
  addressFields.city(body('city')),
  addressFields.address(body('address')),
  validate,
];

export const updateMyAddressValidator = [
  objectId('addressId'),
  body('city')
    .optional()
    .trim()
    .notEmpty().withMessage('City cannot be empty')
    .isLength({ max: 100 })
    .withMessage('City is too long'),
  body('address')
    .optional()
    .trim()
    .notEmpty().withMessage('Address cannot be empty')
    .isLength({ max: 500 })
    .withMessage('Address is too long'),
  validate,
  (req, res, next) => {
    const { city, address } = req.body;
    if ([city, address].every((v) => v === undefined)) {
      return next(new ApiError('Provide at least one field to update', 400));
    }
    next();
  },
];

export const myAddressIdParamValidator = [objectId('addressId'), validate];
