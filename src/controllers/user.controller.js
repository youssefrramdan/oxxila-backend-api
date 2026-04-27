// src/controllers/user.controller.js
import asyncHandler from 'express-async-handler';
import User from '../models/User.js';
import ApiError from '../utils/apiError.js';
import ApiFeatures from '../utils/apiFeatures.js';
import sendResponse from '../utils/apiResponse.js';
import { deleteAsset } from '../middlewares/cloudnairyMiddleware.js';

/**
 * @desc    Get all users
 * @route   GET /api/v1/users
 * @access  Private (admin)
 */
export const getAllUsers = asyncHandler(async (req, res) => {
  const features = new ApiFeatures(User.find(), req.query)
    .filter()
    .search(['name', 'email'])
    .sort()
    .limitFields();

  await features.paginate();

  const users = await features.mongooseQuery;
  const pagination = features.getPaginationResult();

  sendResponse(res, {
    message: 'Users retrieved successfully',
    data: users,
    pagination: { ...pagination, results: users.length },
  });
});

/**
 * @desc    Get specific user by ID
 * @route   GET /api/v1/users/:id
 * @access  Private (admin)
 */
export const getSpecificUser = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.params.id);
  if (!user) return next(new ApiError(`No user found with id: ${req.params.id}`, 404));
  sendResponse(res, { message: 'User retrieved successfully', data: user });
});

/**
 * @desc    Create a new user
 * @route   POST /api/v1/users
 * @access  Private (admin)
 */
export const createUser = asyncHandler(async (req, res) => {
  const user = await User.create(req.body);
  sendResponse(res, { statusCode: 201, message: 'User created successfully', data: user });
});

/**
 * @desc    Update an existing user (admin).
 *          Password and role changes go through dedicated endpoints.
 * @route   PUT /api/v1/users/:id
 * @access  Private (admin)
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
 * @access  Private (admin)
 */
export const deleteUser = asyncHandler(async (req, res, next) => {
  const user = await User.findByIdAndDelete(req.params.id);
  if (!user) return next(new ApiError(`No user found with id: ${req.params.id}`, 404));
  sendResponse(res, { message: 'User deleted successfully' });
});

/**
 * @desc    Activate user (admin)
 * @route   PATCH /api/v1/users/activate/:id
 * @access  Private (admin)
 */
export const activateSpecificUser = asyncHandler(async (req, res, next) => {
  const user = await User.findByIdAndUpdate(
    req.params.id,
    { active: true },
    { new: true }
  );
  if (!user) return next(new ApiError(`No user found with id: ${req.params.id}`, 404));
  sendResponse(res, { message: 'User activated successfully', data: user });
});

/**
 * @desc    Change any user's password (admin).
 *          The User pre-save hook takes care of hashing.
 * @route   PATCH /api/v1/users/changePassword/:id
 * @access  Private (admin)
 */
export const changeUserPassword = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.params.id).select('+password');
  if (!user) return next(new ApiError(`No user found with id: ${req.params.id}`, 404));

  user.password = req.body.password;
  await user.save();

  sendResponse(res, { message: "User's password updated successfully", data: user });
});

// ─── Self-service (authenticated user) ─────────────────────────────────────────

/**
 * @desc    Get currently logged-in user
 * @route   GET /api/v1/users/getMe
 * @access  Private
 */
export const getMe = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.user._id);
  if (!user) return next(new ApiError('Your account no longer exists', 404));
  sendResponse(res, { message: 'Profile retrieved successfully', data: user });
});

/**
 * @desc    List saved delivery addresses for the current user
 * @route   GET /api/v1/users/profile/addresses
 * @access  Private
 */
export const getMyAddresses = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.user._id).select('addresses');
  if (!user) return next(new ApiError('Your account no longer exists', 404));
  sendResponse(res, { message: 'Addresses retrieved successfully', data: { addresses: user.addresses } });
});

/**
 * @desc    Add a delivery address (many per user; use returned _id in orders)
 * @route   POST /api/v1/users/profile/addresses
 * @access  Private
 */
export const addMyAddress = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.user._id);
  if (!user) return next(new ApiError('Your account no longer exists', 404));

  if (!user.phone?.trim()) {
    return next(
      new ApiError(
        'Add your phone number in account settings before adding an address',
        400
      )
    );
  }

  const { city, address } = req.body;
  user.addresses.push({ city, address });
  await user.save();

  const created = user.addresses[user.addresses.length - 1];
  sendResponse(res, {
    statusCode: 201,
    message: 'Address added successfully',
    data: { address: created },
  });
});

/**
 * @desc    Update one of the current user’s addresses
 * @route   PATCH /api/v1/users/profile/addresses/:addressId
 * @access  Private
 */
export const updateMyAddress = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.user._id);
  if (!user) return next(new ApiError('Your account no longer exists', 404));

  const sub = user.addresses.id(req.params.addressId);
  if (!sub) {
    return next(new ApiError(`No address found with id: ${req.params.addressId}`, 404));
  }

  const { city, address } = req.body;
  if (city !== undefined) sub.city = city;
  if (address !== undefined) sub.address = address;

  await user.save();
  sendResponse(res, { message: 'Address updated successfully', data: { address: sub } });
});

/**
 * @desc    Delete a saved address
 * @route   DELETE /api/v1/users/profile/addresses/:addressId
 * @access  Private
 */
export const deleteMyAddress = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.user._id);
  if (!user) return next(new ApiError('Your account no longer exists', 404));

  const sub = user.addresses.id(req.params.addressId);
  if (!sub) {
    return next(new ApiError(`No address found with id: ${req.params.addressId}`, 404));
  }

  sub.deleteOne();
  await user.save();
  sendResponse(res, { message: 'Address deleted successfully' });
});

/**
 * @desc    Update name, email, and/or phone. Avatar: PATCH /updateMyAvatar. Password: PATCH /updateMyPassword
 * @route   PATCH /api/v1/users/updateMe
 * @access  Private
 */
export const updateMe = asyncHandler(async (req, res, next) => {
  if (req.body.password || req.body.oldPassword) {
    return next(new ApiError('This route is not for password updates..', 400));
  }
  if (req.body.role) {
    return next(new ApiError('You are not allowed to change your own role', 403));
  }

  if (req.body.email !== undefined) {
    const u = await User.findById(req.user._id).select('+googleId');
    if (u?.googleId) {
      return next(new ApiError('Google-linked accounts cannot change their email', 400));
    }
  }

  const { name, email, phone } = req.body;
  const update = {};
  if (name !== undefined) update.name = name;
  if (email !== undefined) update.email = email;
  if (phone !== undefined) update.phone = phone;

  const user = await User.findByIdAndUpdate(req.user._id, update, {
    new: true,
    runValidators: true,
  });
  sendResponse(res, { message: 'Profile updated successfully', data: user });
});

/**
 * @desc    Upload / replace the currently logged-in user's avatar.
 *          The actual file upload is handled by the Cloudinary multer
 *          middleware, which sets `req.file.path` to the hosted URL.
 * @route   PATCH /api/v1/users/updateMyAvatar
 * @access  Private
 */
export const uploadMyAvatar = asyncHandler(async (req, res, next) => {
  if (!req.file) return next(new ApiError('Please upload an avatar image', 400));

  // multer-storage-cloudinary sets file.path to the hosted URL and
  // file.filename to the Cloudinary public_id.
  const { path: url, filename: publicId } = req.file;

  const user = await User.findById(req.user._id).select('+avatarPublicId');
  if (!user) {
    // Orphan cleanup — the freshly uploaded asset has no owner anymore.
    await deleteAsset(publicId);
    return next(new ApiError('Your account no longer exists', 404));
  }

  const previousPublicId = user.avatarPublicId;
  user.avatar = url;
  user.avatarPublicId = publicId;
  await user.save({ validateModifiedOnly: true });

  // Best-effort cleanup of the old asset; non-blocking on failure.
  await deleteAsset(previousPublicId);

  sendResponse(res, { message: 'Avatar updated successfully', data: user });
});

/**
 * @desc    Update currently logged-in user's password
 * @route   PATCH /api/v1/users/updateMyPassword
 * @access  Private
 */
export const updateMyPassword = asyncHandler(async (req, res, next) => {
  const { oldPassword, newPassword } = req.body;

  const user = await User.findById(req.user._id).select('+password');
  if (!user) return next(new ApiError('Your account no longer exists', 404));

  if (!(await user.comparePassword(oldPassword))) {
    return next(new ApiError('Your current password is incorrect', 400));
  }

  user.password = newPassword;
  await user.save();

  sendResponse(res, { message: 'Your password has been updated successfully' });
});

/**
 * @desc    Deactivate own account
 * @route   PATCH /api/v1/users/deactivateMe
 * @access  Private
 */
export const deactivateMe = asyncHandler(async (req, res) => {
  await User.findByIdAndUpdate(req.user._id, { active: false });
  sendResponse(res, { message: 'Your account has been deactivated' });
});

/**
 * @desc    Reactivate own account
 * @route   PATCH /api/v1/users/activateMe
 * @access  Private
 */
export const activateMe = asyncHandler(async (req, res) => {
  await User.findByIdAndUpdate(req.user._id, { active: true });
  sendResponse(res, { message: 'Your account has been reactivated' });
});
