// src/validators/admin.validator.js
import { body, param } from 'express-validator';
import validate from '../middlewares/validate.middleware.js';

const adminIdParam = () => param('id').isMongoId().withMessage('Invalid admin ID');

export const createAdminValidator = [
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Name is required')
    .isLength({ min: 2, max: 60 })
    .withMessage('Name must be 2-60 characters'),
  body('email').trim().isEmail().withMessage('Valid email is required').normalizeEmail(),
  body('password')
    .isString()
    .isLength({ min: 8, max: 128 })
    .withMessage('Password must be 8-128 characters'),
  body('adminTitle')
    .optional({ values: 'null' })
    .trim()
    .isLength({ max: 80 })
    .withMessage('Admin title cannot exceed 80 characters'),
  body('phone').optional().trim().isLength({ max: 30 }).withMessage('Phone is too long'),
  validate,
];

export const updateAdminValidator = [
  adminIdParam(),
  body('name').optional().trim().isLength({ min: 2, max: 60 }),
  body('email').optional().trim().isEmail().normalizeEmail(),
  body('adminTitle')
    .optional({ values: 'null' })
    .trim()
    .isLength({ max: 80 })
    .withMessage('Admin title cannot exceed 80 characters'),
  body('phone').optional().trim().isLength({ max: 30 }),
  body('active').optional().isBoolean(),
  validate,
];

export const adminIdValidator = [adminIdParam(), validate];
