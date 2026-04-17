// src/validators/user.validator.js
import { body, param } from 'express-validator';
import mongoose from 'mongoose';
import validate from '../middlewares/validate.middleware.js';

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
  body('avatar').optional().isString(),
  validate,
];

export const updateMyPasswordValidator = [
  body('oldPassword').notEmpty().withMessage('Old password is required'),
  passwordRule('newPassword'),
  validate,
];
