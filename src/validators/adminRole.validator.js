// src/validators/adminRole.validator.js
import { body, param } from 'express-validator';
import validate from '../middlewares/validate.middleware.js';
import { ADMIN_TAB_KEYS, CRUD_ACTIONS } from '../constants/adminTabs.js';

const roleIdParam = () => param('id').isMongoId().withMessage('Invalid role id');

const permissionsValidator = body('permissions')
  .optional()
  .isObject()
  .withMessage('permissions must be an object')
  .custom((perms) => {
    for (const key of Object.keys(perms || {})) {
      if (!ADMIN_TAB_KEYS.includes(key)) {
        throw new Error(`Unknown tab key in permissions: ${key}`);
      }
      const row = perms[key];
      if (row == null || typeof row !== 'object' || Array.isArray(row)) {
        throw new Error(`permissions.${key} must be an object`);
      }
      for (const action of Object.keys(row)) {
        if (!CRUD_ACTIONS.includes(action)) {
          throw new Error(`Unknown action "${action}" on tab "${key}"`);
        }
        if (typeof row[action] !== 'boolean') {
          throw new Error(`permissions.${key}.${action} must be a boolean`);
        }
      }
    }
    return true;
  });

export const createAdminRoleValidator = [
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Role name is required')
    .isLength({ min: 2, max: 80 })
    .withMessage('Role name must be 2-80 characters'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Description must be at most 500 characters'),
  permissionsValidator,
  validate,
];

export const updateAdminRoleValidator = [
  roleIdParam(),
  body('name')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Role name cannot be empty')
    .isLength({ min: 2, max: 80 })
    .withMessage('Role name must be 2-80 characters'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Description must be at most 500 characters'),
  permissionsValidator,
  validate,
];

export const adminRoleIdValidator = [roleIdParam(), validate];
