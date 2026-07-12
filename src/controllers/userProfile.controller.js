// src/controllers/userProfile.controller.js
import asyncHandler from 'express-async-handler';
import User from '../models/User.js';
import ApiError from '../utils/apiError.js';
import sendResponse from '../utils/apiResponse.js';
import { deleteAsset } from '../middlewares/cloudnairyMiddleware.js';
import { appendUserAddress, buildShippingSnapshot, healUserAddressEntry } from './order.controller.js';

/** Build a stored user address subdoc from a shipping snapshot */
const buildUserAddressFromSnapshot = (shippingAddress, { label = '', isDefault = false } = {}) => ({
  label: String(label || '').trim(),
  governorate: {
    id: shippingAddress.governorateId,
    name: shippingAddress.governorateName,
  },
  district: shippingAddress.isOther
    ? null
    : {
        id: shippingAddress.districtId,
        name: shippingAddress.districtName,
      },
  addressLine: shippingAddress.addressLine,
  isOther: shippingAddress.isOther,
  isDefault: Boolean(isDefault),
});

/** Clear isDefault on all addresses except the one kept */
const clearOtherDefaults = (addresses, keepId = null) => {
  for (const entry of addresses) {
    if (keepId && String(entry._id) === String(keepId)) continue;
    entry.isDefault = false;
  }
};

/** Apply address field updates (rebuilds geo when location fields change) */
const applyUserAddressUpdates = async (user, sub, updates) => {
  const geoChanged = ['governorateId', 'districtId', 'addressLine'].some(
    (key) => updates[key] !== undefined
  );

  if (geoChanged) {
    const input = {
      governorateId: updates.governorateId ?? sub.governorate.id,
      districtId:
        updates.districtId ?? (sub.isOther ? 'other' : sub.district?.id ?? 'other'),
      addressLine: updates.addressLine ?? sub.addressLine,
    };
    const { shippingAddress } = await buildShippingSnapshot(input);
    const rebuilt = buildUserAddressFromSnapshot(shippingAddress, {
      label: updates.label ?? sub.label,
      isDefault: updates.isDefault ?? sub.isDefault,
    });
    Object.assign(sub, rebuilt);
  } else {
    await healUserAddressEntry(sub, { soft: true });
    if (updates.label !== undefined) sub.label = String(updates.label).trim();
    if (updates.isDefault === true) {
      clearOtherDefaults(user.addresses, sub._id);
      sub.isDefault = true;
    } else if (updates.isDefault === false) {
      sub.isDefault = false;
    }
  }

  if (!user.addresses.some((a) => a.isDefault) && user.addresses.length) {
    user.addresses[0].isDefault = true;
  }

  await user.save();
  return sub;
};

/**
 * @desc    Get the current user's profile
 * @route   GET /api/v1/users/getMe
 * @access  Private
 */
export const getMe = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.user._id);
  if (!user) return next(new ApiError('Your account no longer exists', 404));

  let dirty = false;
  for (const entry of user.addresses || []) {
    const result = await healUserAddressEntry(entry, { soft: true });
    if (result.healed) dirty = true;
  }
  if (dirty) await user.save();

  sendResponse(res, { message: 'Profile retrieved successfully', data: user });
});

/**
 * @desc    List the current user's addresses
 * @route   GET /api/v1/users/profile/addresses
 * @access  Private
 */
export const getMyAddresses = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.user._id).select('addresses');
  if (!user) return next(new ApiError('Your account no longer exists', 404));

  let dirty = false;
  for (const entry of user.addresses) {
    const result = await healUserAddressEntry(entry, { soft: true });
    if (result.healed) dirty = true;
  }
  if (dirty) await user.save();

  sendResponse(res, {
    message: 'Addresses retrieved successfully',
    data: { addresses: user.addresses },
  });
});

/**
 * @desc    Add an address to the current user
 * @route   POST /api/v1/users/profile/addresses
 * @access  Private
 */
export const addMyAddress = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.user._id);
  if (!user) return next(new ApiError('Your account no longer exists', 404));

  if (!user.phone?.trim()) {
    return next(
      new ApiError('Add your phone number in account settings before adding an address', 400)
    );
  }

  const { governorateId, districtId, addressLine, label, isDefault } = req.body;
  const created = await appendUserAddress(
    user._id,
    { governorateId, districtId, addressLine },
    { label, isDefault }
  );

  sendResponse(res, {
    statusCode: 201,
    message: 'Address added successfully',
    data: { address: created },
  });
});

/**
 * @desc    Update one of the current user's addresses
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

  const { governorateId, districtId, addressLine, label, isDefault } = req.body;
  const updated = await applyUserAddressUpdates(user, sub, {
    governorateId,
    districtId,
    addressLine,
    label,
    isDefault,
  });

  sendResponse(res, { message: 'Address updated successfully', data: { address: updated } });
});

/**
 * @desc    Set an address as the default
 * @route   PATCH /api/v1/users/profile/addresses/:addressId/default
 * @access  Private
 */
export const setMyDefaultAddress = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.user._id);
  if (!user) return next(new ApiError('Your account no longer exists', 404));

  const sub = user.addresses.id(req.params.addressId);
  if (!sub) {
    return next(new ApiError(`No address found with id: ${req.params.addressId}`, 404));
  }

  clearOtherDefaults(user.addresses, sub._id);
  sub.isDefault = true;
  await user.save();

  sendResponse(res, { message: 'Default address updated successfully', data: { address: sub } });
});

/**
 * @desc    Delete one of the current user's addresses
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

  const wasDefault = sub.isDefault;
  sub.deleteOne();
  if (wasDefault && user.addresses.length) {
    user.addresses[0].isDefault = true;
  }

  await user.save();
  sendResponse(res, { message: 'Address deleted successfully' });
});

/**
 * @desc    Update the current user's profile fields
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

/**
 * @desc    Upload or replace the current user's avatar
 * @route   PATCH /api/v1/users/updateMyAvatar
 * @access  Private
 */
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

/**
 * @desc    Change the current user's password
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
 * @desc    Deactivate the current user's account
 * @route   PATCH /api/v1/users/deactivateMe
 * @access  Private
 */
export const deactivateMe = asyncHandler(async (req, res) => {
  await User.findByIdAndUpdate(req.user._id, { active: false });
  sendResponse(res, { message: 'Your account has been deactivated' });
});

/**
 * @desc    Reactivate the current user's account
 * @route   PATCH /api/v1/users/activateMe
 * @access  Private
 */
export const activateMe = asyncHandler(async (req, res) => {
  await User.findByIdAndUpdate(req.user._id, { active: true });
  sendResponse(res, { message: 'Your account has been reactivated' });
});
