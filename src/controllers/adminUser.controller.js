// src/controllers/adminUser.controller.js
import asyncHandler from 'express-async-handler';
import User from '../models/User.js';
import AdminRole from '../models/AdminRole.js';
import ApiError from '../utils/apiError.js';
import ApiFeatures from '../utils/apiFeatures.js';
import sendResponse from '../utils/apiResponse.js';
import { adminRolePopulate, countAdminsWithRole, serializeAdminRole } from '../utils/adminRole.js';
import { SUPER_ADMIN_SLUG } from '../constants/adminTabs.js';

const ADMIN_FILTER = { role: 'admin' };

const adminNotFound = (id) => new ApiError(`No admin found with id: ${id}`, 404);

const serializeAdminUser = (admin) => {
  if (!admin) return admin;
  const obj = typeof admin.toObject === 'function' ? admin.toObject() : { ...admin };
  delete obj.password;
  if (obj.adminRole) obj.adminRole = serializeAdminRole(obj.adminRole);
  return obj;
};

const assertNotLastSuperAdmin = async (adminUser, nextAction) => {
  const role = adminUser.adminRole;
  const roleDoc =
    role && typeof role === 'object' && role.slug
      ? role
      : role
        ? await AdminRole.findById(role).select('slug isSystem')
        : null;

  if (!roleDoc || (roleDoc.slug !== SUPER_ADMIN_SLUG && !roleDoc.isSystem)) return;

  const remaining = await countAdminsWithRole(roleDoc._id, User);
  if (remaining <= 1) {
    throw new ApiError(
      `Cannot ${nextAction}: this is the last Super Admin. Assign another Super Admin first.`,
      400
    );
  }
};

/**
 * @desc    List all admins
 * @route   GET /api/v1/admins
 * @access  Admin + roles:read
 */
export const getAllAdmins = asyncHandler(async (req, res) => {
  const features = new ApiFeatures(User.find(ADMIN_FILTER).populate(adminRolePopulate), req.query)
    .search(['name', 'email', 'adminTitle'])
    .sort()
    .limitFields();

  await features.paginate();

  const admins = await features.mongooseQuery.lean();
  const pagination = features.getPaginationResult();

  sendResponse(res, {
    message: 'Admins retrieved successfully',
    data: admins.map(serializeAdminUser),
    pagination: { ...pagination, results: admins.length },
  });
});

/**
 * @desc    Get one admin
 * @route   GET /api/v1/admins/:id
 */
export const getAdmin = asyncHandler(async (req, res, next) => {
  const admin = await User.findOne({ _id: req.params.id, ...ADMIN_FILTER })
    .populate(adminRolePopulate)
    .lean();
  if (!admin) return next(adminNotFound(req.params.id));
  sendResponse(res, { message: 'Admin retrieved successfully', data: serializeAdminUser(admin) });
});

/**
 * @desc    Create admin
 * @route   POST /api/v1/admins
 */
export const createAdmin = asyncHandler(async (req, res, next) => {
  const { name, email, password, adminTitle, phone, adminRole } = req.body;

  const exists = await User.findOne({ email });
  if (exists) return next(new ApiError('Email already in use', 400));

  if (!adminRole) {
    return next(new ApiError('adminRole is required when creating an admin', 400));
  }

  const role = await AdminRole.findById(adminRole);
  if (!role) return next(new ApiError(`No admin role found with id: ${adminRole}`, 404));

  const admin = await User.create({
    name,
    email,
    password,
    phone: phone ?? '',
    adminTitle: adminTitle ?? null,
    role: 'admin',
    adminRole: role._id,
  });

  await admin.populate(adminRolePopulate);

  sendResponse(res, {
    statusCode: 201,
    message: 'Admin created successfully',
    data: serializeAdminUser(admin),
  });
});

/**
 * @desc    Update admin (name, email, phone, adminTitle, active, adminRole)
 * @route   PUT /api/v1/admins/:id
 */
export const updateAdmin = asyncHandler(async (req, res, next) => {
  const { name, email, phone, adminTitle, active, adminRole } = req.body;

  const existing = await User.findOne({ _id: req.params.id, ...ADMIN_FILTER }).populate(
    adminRolePopulate
  );
  if (!existing) return next(adminNotFound(req.params.id));

  if (adminRole !== undefined) {
    const role = await AdminRole.findById(adminRole);
    if (!role) return next(new ApiError(`No admin role found with id: ${adminRole}`, 404));

    const currentRoleId = existing.adminRole?._id?.toString() || existing.adminRole?.toString();
    if (currentRoleId && currentRoleId !== String(role._id)) {
      await assertNotLastSuperAdmin(existing, 'change role of');
    }
    existing.adminRole = role._id;
  }

  if (active === false) {
    await assertNotLastSuperAdmin(existing, 'deactivate');
  }

  if (name !== undefined) existing.name = name;
  if (email !== undefined) existing.email = email;
  if (phone !== undefined) existing.phone = phone;
  if (adminTitle !== undefined) existing.adminTitle = adminTitle;
  if (active !== undefined) existing.active = active;

  await existing.save();
  await existing.populate(adminRolePopulate);

  sendResponse(res, {
    message: 'Admin updated successfully',
    data: serializeAdminUser(existing),
  });
});

/**
 * @desc    Delete admin
 * @route   DELETE /api/v1/admins/:id
 */
export const deleteAdmin = asyncHandler(async (req, res, next) => {
  if (String(req.user._id) === String(req.params.id)) {
    return next(new ApiError('You cannot delete your own admin account', 400));
  }

  const admin = await User.findOne({ _id: req.params.id, ...ADMIN_FILTER }).populate(
    adminRolePopulate
  );
  if (!admin) return next(adminNotFound(req.params.id));

  await assertNotLastSuperAdmin(admin, 'delete');
  await admin.deleteOne();

  sendResponse(res, { message: 'Admin deleted successfully' });
});
