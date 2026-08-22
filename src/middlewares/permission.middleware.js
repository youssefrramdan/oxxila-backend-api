// src/middlewares/permission.middleware.js
import asyncHandler from 'express-async-handler';
import ApiError from '../utils/apiError.js';
import AdminRole from '../models/AdminRole.js';
import { userHasPermission } from '../utils/adminRole.js';
import { ADMIN_TAB_KEYS, CRUD_ACTIONS } from '../constants/adminTabs.js';

const ensureAdminRolePopulated = async (req) => {
  if (!req.user || req.user.role !== 'admin') return;
  if (req.user.adminRole && typeof req.user.adminRole === 'object' && req.user.adminRole.permissions) {
    return;
  }
  if (!req.user.adminRole) return;

  req.user.adminRole = await AdminRole.findById(req.user.adminRole).select(
    'name slug description isSystem permissions'
  );
};

/**
 * Require an admin RBAC permission for a tab + CRUD action.
 * Run after protectedRoutes + allowTo('admin').
 */
export const requirePermission = (tab, action) =>
  asyncHandler(async (req, res, next) => {
    if (!ADMIN_TAB_KEYS.includes(tab)) {
      return next(new ApiError(`Unknown permission tab: ${tab}`, 500));
    }
    if (!CRUD_ACTIONS.includes(action)) {
      return next(new ApiError(`Unknown permission action: ${action}`, 500));
    }

    await ensureAdminRolePopulated(req);

    if (!req.user?.adminRole) {
      return next(
        new ApiError('Your admin account has no role assigned. Contact a Super Admin.', 403)
      );
    }

    if (!userHasPermission(req.user, tab, action)) {
      return next(new ApiError(`You do not have permission to ${action} on "${tab}"`, 403));
    }

    next();
  });
