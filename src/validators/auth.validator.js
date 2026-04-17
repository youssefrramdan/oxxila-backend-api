// src/validators/auth.validator.js
import { body, param } from 'express-validator';
import validate from '../middlewares/validate.middleware.js';

const passwordRule = (field) =>
  body(field)
    .isString()
    .isLength({ min: 8, max: 128 })
    .withMessage('Password must be 8-128 characters');

export const registerValidator = [
  body('name').trim().notEmpty().withMessage('Name is required')
    .isLength({ min: 2, max: 60 }).withMessage('Name must be 2-60 characters'),
  body('email').trim().isEmail().withMessage('Valid email is required').normalizeEmail(),
  passwordRule('password'),
  body('role').optional().isIn(['user', 'admin']).withMessage('Invalid role'),
  validate,
];

export const loginValidator = [
  body('email').trim().isEmail().withMessage('Valid email is required').normalizeEmail(),
  body('password').notEmpty().withMessage('Password is required'),
  validate,
];

export const forgetPasswordValidator = [
  body('email').trim().isEmail().withMessage('Valid email is required').normalizeEmail(),
  validate,
];

export const verifyResetTokenValidator = [
  param('token').isString().isLength({ min: 32 }).withMessage('Invalid reset token'),
  validate,
];

export const resetPasswordValidator = [
  param('token').isString().isLength({ min: 32 }).withMessage('Invalid reset token'),
  passwordRule('newPassword'),
  body('confirmPassword')
    .notEmpty().withMessage('Please confirm your new password')
    .custom((value, { req }) => value === req.body.newPassword)
    .withMessage('Passwords do not match'),
  validate,
];
