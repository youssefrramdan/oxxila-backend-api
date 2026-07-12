// src/controllers/userAdmin.controller.js
// Admin user management (CRUD, activate, password)
import asyncHandler from 'express-async-handler';
import User from '../models/User.js';
import ApiError from '../utils/apiError.js';
import ApiFeatures from '../utils/apiFeatures.js';
import sendResponse from '../utils/apiResponse.js';

/**
 * @desc    List all users
 * @route   GET /api/v1/users
 * @access  Admin
 */
export const getAllUsers = asyncHandler(async (req, res) => {
  const features = new ApiFeatures(User.find(), req.query)
    .filter()
    .search(['name', 'email'])
    .sort()
    .limitFields();

  await features.paginate();

  const users = await features.mongooseQuery.lean();
  const pagination = features.getPaginationResult();

  sendResponse(res, {
    message: 'Users retrieved successfully',
    data: users,
    pagination: { ...pagination, results: users.length },
  });
});

/**
 * @desc    Get one user
 * @route   GET /api/v1/users/:id
 * @access  Admin
 */
export const getSpecificUser = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.params.id).lean();
  if (!user) return next(new ApiError(`No user found with id: ${req.params.id}`, 404));
  sendResponse(res, { message: 'User retrieved successfully', data: user });
});

/**
 * @desc    Create user
 * @route   POST /api/v1/users
 * @access  Admin
 */
export const createUser = asyncHandler(async (req, res) => {
  const user = await User.create(req.body);
  sendResponse(res, { statusCode: 201, message: 'User created successfully', data: user });
});

/**
 * @desc    Update user (excludes password/role from body)
 * @route   PUT /api/v1/users/:id
 * @access  Admin
 */
export const updateUser = asyncHandler(async (req, res, next) => {
  const { password, role, ...rest } = req.body;
  const user = await User.findByIdAndUpdate(req.params.id, rest, {
    new: true,
    runValidators: true,
  });
  if (!user) return next(new ApiError(`No user found with id: ${req.params.id}`, 404));
  sendResponse(res, { message: 'User updated successfully', data: user });
});

/**
 * @desc    Delete user
 * @route   DELETE /api/v1/users/:id
 * @access  Admin
 */
export const deleteUser = asyncHandler(async (req, res, next) => {
  const user = await User.findByIdAndDelete(req.params.id);
  if (!user) return next(new ApiError(`No user found with id: ${req.params.id}`, 404));
  sendResponse(res, { message: 'User deleted successfully' });
});

/**
 * @desc    Activate user
 * @route   PATCH /api/v1/users/activate/:id
 * @access  Admin
 */
export const activateSpecificUser = asyncHandler(async (req, res, next) => {
  const user = await User.findByIdAndUpdate(req.params.id, { active: true }, { new: true });
  if (!user) return next(new ApiError(`No user found with id: ${req.params.id}`, 404));
  sendResponse(res, { message: 'User activated successfully', data: user });
});

/**
 * @desc    Change user password
 * @route   PATCH /api/v1/users/changePassword/:id
 * @access  Admin
 */
export const changeUserPassword = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.params.id).select('+password');
  if (!user) return next(new ApiError(`No user found with id: ${req.params.id}`, 404));

  user.password = req.body.password;
  await user.save();

  sendResponse(res, { message: "User's password updated successfully", data: user });
});
