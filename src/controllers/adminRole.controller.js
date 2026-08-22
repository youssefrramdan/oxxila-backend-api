// src/controllers/adminRole.controller.js
import asyncHandler from 'express-async-handler';
import AdminRole from '../models/AdminRole.js';
import User from '../models/User.js';
import ApiError from '../utils/apiError.js';
import sendResponse from '../utils/apiResponse.js';
import {
  ADMIN_TAB_META,
  normalizePermissions,
  SUPER_ADMIN_SLUG,
} from '../constants/adminTabs.js';
import { countAdminsWithRole, serializeAdminRole } from '../utils/adminRole.js';

/**
 * @desc    Fixed tab registry for Roles UI checkboxes
 * @route   GET /api/v1/admin-roles/tabs
 */
export const getAdminRoleTabs = asyncHandler(async (req, res) => {
  sendResponse(res, {
    message: 'Admin tabs retrieved successfully',
    data: ADMIN_TAB_META,
  });
});

/**
 * @desc    List all admin roles
 * @route   GET /api/v1/admin-roles
 */
export const getAdminRoles = asyncHandler(async (req, res) => {
  const roles = await AdminRole.find().sort({ isSystem: -1, name: 1 }).lean();
  sendResponse(res, {
    message: 'Admin roles retrieved successfully',
    data: roles.map((r) => serializeAdminRole(r)),
  });
});

/**
 * @desc    Get one admin role
 * @route   GET /api/v1/admin-roles/:id
 */
export const getAdminRole = asyncHandler(async (req, res, next) => {
  const role = await AdminRole.findById(req.params.id).lean();
  if (!role) return next(new ApiError(`No admin role found with id: ${req.params.id}`, 404));
  sendResponse(res, {
    message: 'Admin role retrieved successfully',
    data: serializeAdminRole(role),
  });
});

/**
 * @desc    Create admin role
 * @route   POST /api/v1/admin-roles
 */
export const createAdminRole = asyncHandler(async (req, res, next) => {
  const name = req.body.name?.trim();
  const exists = await AdminRole.findOne({ name });
  if (exists) return next(new ApiError('A role with this name already exists', 409));

  const role = await AdminRole.create({
    name,
    description: req.body.description?.trim() || '',
    isSystem: false,
    permissions: normalizePermissions(req.body.permissions),
  });

  sendResponse(res, {
    statusCode: 201,
    message: 'Admin role created successfully',
    data: serializeAdminRole(role),
  });
});

/**
 * @desc    Update admin role
 * @route   PUT /api/v1/admin-roles/:id
 */
export const updateAdminRole = asyncHandler(async (req, res, next) => {
  const role = await AdminRole.findById(req.params.id);
  if (!role) return next(new ApiError(`No admin role found with id: ${req.params.id}`, 404));

  if (role.isSystem || role.slug === SUPER_ADMIN_SLUG) {
    if (req.body.name !== undefined && req.body.name.trim() !== role.name) {
      return next(new ApiError('Cannot rename the system Super Admin role', 400));
    }
    if (req.body.permissions !== undefined) {
      return next(new ApiError('Cannot change permissions on the system Super Admin role', 400));
    }
  }

  if (req.body.name !== undefined) role.name = req.body.name.trim();
  if (req.body.description !== undefined) role.description = req.body.description.trim();
  if (req.body.permissions !== undefined) {
    role.permissions = normalizePermissions(req.body.permissions);
  }

  await role.save();

  sendResponse(res, {
    message: 'Admin role updated successfully',
    data: serializeAdminRole(role),
  });
});

/**
 * @desc    Delete admin role (not system; no users assigned)
 * @route   DELETE /api/v1/admin-roles/:id
 */
export const deleteAdminRole = asyncHandler(async (req, res, next) => {
  const role = await AdminRole.findById(req.params.id);
  if (!role) return next(new ApiError(`No admin role found with id: ${req.params.id}`, 404));

  if (role.isSystem || role.slug === SUPER_ADMIN_SLUG) {
    return next(new ApiError('Cannot delete the system Super Admin role', 400));
  }

  const assigned = await countAdminsWithRole(role._id, User);
  if (assigned > 0) {
    return next(
      new ApiError(
        `Cannot delete role: ${assigned} admin(s) still assigned. Reassign them first.`,
        400
      )
    );
  }

  await role.deleteOne();
  sendResponse(res, { message: 'Admin role deleted successfully' });
});
