// src/middlewares/superAdmin.middleware.js
import asyncHandler from 'express-async-handler';
import ApiError from '../utils/apiError.js';
import AdminRole from '../models/AdminRole.js';
import { SUPER_ADMIN_SLUG } from '../constants/adminTabs.js';

const ensureAdminRolePopulated = async (req) => {
  if (!req.user || req.user.role !== 'admin') return;
  if (req.user.adminRole && typeof req.user.adminRole === 'object' && req.user.adminRole.slug) {
    return;
  }
  if (!req.user.adminRole) return;
  req.user.adminRole = await AdminRole.findById(req.user.adminRole).select('name slug isSystem');
};

/** Restrict route to Super Admin only. Run after protectedRoutes + allowTo('admin'). */
export const requireSuperAdmin = asyncHandler(async (req, res, next) => {
  await ensureAdminRolePopulated(req);

  const slug = req.user?.adminRole?.slug;
  const isSystem = req.user?.adminRole?.isSystem;

  if (slug !== SUPER_ADMIN_SLUG && !isSystem) {
    return next(new ApiError('Super Admin access is required for this action', 403));
  }

  next();
});
