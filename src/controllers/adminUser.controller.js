// src/controllers/adminUser.controller.js
import asyncHandler from 'express-async-handler';
import User from '../models/User.js';
import ApiError from '../utils/apiError.js';
import ApiFeatures from '../utils/apiFeatures.js';
import sendResponse from '../utils/apiResponse.js';

const ADMIN_FILTER = { role: 'admin' };

const adminNotFound = (id) => new ApiError(`No admin found with id: ${id}`, 404);

/**
 * @desc    List all admins
 * @route   GET /api/v1/admins
 * @access  Admin
 */
export const getAllAdmins = asyncHandler(async (req, res) => {
  const features = new ApiFeatures(User.find(ADMIN_FILTER), req.query)
    .search(['name', 'email', 'adminTitle'])
    .sort()
    .limitFields();

  await features.paginate();

  const admins = await features.mongooseQuery.lean();
  const pagination = features.getPaginationResult();

  sendResponse(res, {
    message: 'Admins retrieved successfully',
    data: admins,
    pagination: { ...pagination, results: admins.length },
  });
});

/**
 * @desc    Get one admin
 * @route   GET /api/v1/admins/:id
 * @access  Admin
 */
export const getAdmin = asyncHandler(async (req, res, next) => {
  const admin = await User.findOne({ _id: req.params.id, ...ADMIN_FILTER }).lean();
  if (!admin) return next(adminNotFound(req.params.id));
  sendResponse(res, { message: 'Admin retrieved successfully', data: admin });
});

/**
 * @desc    Create admin
 * @route   POST /api/v1/admins
 * @access  Admin
 */
export const createAdmin = asyncHandler(async (req, res, next) => {
  const { name, email, password, adminTitle, phone } = req.body;

  const exists = await User.findOne({ email });
  if (exists) return next(new ApiError('Email already in use', 400));

  const admin = await User.create({
    name,
    email,
    password,
    phone: phone ?? '',
    adminTitle: adminTitle ?? null,
    role: 'admin',
  });

  sendResponse(res, {
    statusCode: 201,
    message: 'Admin created successfully',
    data: admin,
  });
});

/**
 * @desc    Update admin (name, email, phone, adminTitle, active)
 * @route   PUT /api/v1/admins/:id
 * @access  Admin
 */
export const updateAdmin = asyncHandler(async (req, res, next) => {
  const { name, email, phone, adminTitle, active } = req.body;
  const updates = {};

  if (name !== undefined) updates.name = name;
  if (email !== undefined) updates.email = email;
  if (phone !== undefined) updates.phone = phone;
  if (adminTitle !== undefined) updates.adminTitle = adminTitle;
  if (active !== undefined) updates.active = active;

  const admin = await User.findOneAndUpdate(
    { _id: req.params.id, ...ADMIN_FILTER },
    updates,
    { new: true, runValidators: true }
  );

  if (!admin) return next(adminNotFound(req.params.id));
  sendResponse(res, { message: 'Admin updated successfully', data: admin });
});

/**
 * @desc    Delete admin
 * @route   DELETE /api/v1/admins/:id
 * @access  Admin
 */
export const deleteAdmin = asyncHandler(async (req, res, next) => {
  if (String(req.user._id) === String(req.params.id)) {
    return next(new ApiError('You cannot delete your own admin account', 400));
  }

  const admin = await User.findOneAndDelete({ _id: req.params.id, ...ADMIN_FILTER });
  if (!admin) return next(adminNotFound(req.params.id));
  sendResponse(res, { message: 'Admin deleted successfully' });
});
