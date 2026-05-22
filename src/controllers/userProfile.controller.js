// src/controllers/userProfile.controller.js
import asyncHandler from 'express-async-handler';
import User from '../models/User.js';
import ApiError from '../utils/apiError.js';
import sendResponse from '../utils/apiResponse.js';
import { deleteAsset } from '../middlewares/cloudnairyMiddleware.js';

export const getMe = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.user._id).lean();
  if (!user) return next(new ApiError('Your account no longer exists', 404));
  sendResponse(res, { message: 'Profile retrieved successfully', data: user });
});

export const getMyAddresses = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.user._id).select('addresses').lean();
  if (!user) return next(new ApiError('Your account no longer exists', 404));
  sendResponse(res, { message: 'Addresses retrieved successfully', data: { addresses: user.addresses } });
});

export const addMyAddress = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.user._id);
  if (!user) return next(new ApiError('Your account no longer exists', 404));

  if (!user.phone?.trim()) {
    return next(
      new ApiError('Add your phone number in account settings before adding an address', 400)
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

export const updateMe = asyncHandler(async (req, res, next) => {
  if (req.body.password || req.body.oldPassword) {
    return next(new ApiError('This route is not for password updates..', 400));
  }
  if (req.body.role) {
    return next(new ApiError('You are not allowed to change your own role', 403));
  }

  if (req.body.email !== undefined) {
    const u = await User.findById(req.user._id).select('+googleId');
    const normalizedRequestedEmail = String(req.body.email).trim().toLowerCase();
    const normalizedCurrentEmail = String(u?.email ?? '').trim().toLowerCase();

    if (u?.googleId && normalizedRequestedEmail !== normalizedCurrentEmail) {
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

export const uploadMyAvatar = asyncHandler(async (req, res, next) => {
  if (!req.file) return next(new ApiError('Please upload an avatar image', 400));

  const { path: url, filename: publicId } = req.file;

  const user = await User.findById(req.user._id).select('+avatarPublicId');
  if (!user) {
    await deleteAsset(publicId);
    return next(new ApiError('Your account no longer exists', 404));
  }

  const previousPublicId = user.avatarPublicId;
  user.avatar = url;
  user.avatarPublicId = publicId;
  await user.save({ validateModifiedOnly: true });

  await deleteAsset(previousPublicId);

  sendResponse(res, { message: 'Avatar updated successfully', data: user });
});

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

export const deactivateMe = asyncHandler(async (req, res) => {
  await User.findByIdAndUpdate(req.user._id, { active: false });
  sendResponse(res, { message: 'Your account has been deactivated' });
});

export const activateMe = asyncHandler(async (req, res) => {
  await User.findByIdAndUpdate(req.user._id, { active: true });
  sendResponse(res, { message: 'Your account has been reactivated' });
});
