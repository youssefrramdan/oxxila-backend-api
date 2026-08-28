// src/controllers/shippingMethod.controller.js
import asyncHandler from 'express-async-handler';
import ShippingMethodSetting, { SHIPPING_METHOD_TYPES } from '../models/ShippingMethodSetting.js';
import ApiError from '../utils/apiError.js';
import sendResponse from '../utils/apiResponse.js';
import { recordAdminActivity } from '../utils/adminActivity.js';

/**
 * @desc    List shipping method type toggles (api / known / internal)
 * @route   GET /api/v1/admin/shipping/methods
 * @access  Admin
 */
export const getShippingMethods = asyncHandler(async (req, res) => {
  await ShippingMethodSetting.ensureDefaults();
  const methods = await ShippingMethodSetting.find()
    .sort({ type: 1 })
    .lean();

  sendResponse(res, {
    message: 'Shipping methods retrieved successfully',
    data: methods,
  });
});

/**
 * @desc    Enable / disable a shipping method type globally
 * @route   PATCH /api/v1/admin/shipping/methods/:type
 * @access  Admin
 */
export const updateShippingMethod = asyncHandler(async (req, res, next) => {
  const type = String(req.params.type || '').toLowerCase();
  if (!SHIPPING_METHOD_TYPES.includes(type)) {
    return next(new ApiError(`Invalid shipping method type: ${req.params.type}`, 400));
  }

  await ShippingMethodSetting.ensureDefaults();

  const previous = await ShippingMethodSetting.findOne({ type }).lean();

  const method = await ShippingMethodSetting.findOneAndUpdate(
    { type },
    { isEnabled: Boolean(req.body.isEnabled) },
    { new: true, runValidators: true }
  );

  if (!method) {
    return next(new ApiError(`No shipping method found with type: ${type}`, 404));
  }

  recordAdminActivity(req, {
    tab: 'shipping',
    action: 'update',
    resourceType: 'shippingMethod',
    resourceId: type,
    resourceLabel: type,
    summary: `${method.isEnabled ? 'Enabled' : 'Disabled'} shipping method "${type}"`,
    changes: previous
      ? { isEnabled: { from: previous.isEnabled, to: method.isEnabled } }
      : null,
  });

  sendResponse(res, {
    message: `Shipping method ${type} ${method.isEnabled ? 'enabled' : 'disabled'} successfully`,
    data: method,
  });
});
