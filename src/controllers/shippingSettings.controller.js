// src/controllers/shippingSettings.controller.js
import asyncHandler from 'express-async-handler';
import ShippingSettings from '../models/ShippingSettings.js';
import sendResponse from '../utils/apiResponse.js';

/**
 * @desc    Get shipping method toggles (admin)
 * @route   GET /api/v1/admin/shipping-settings
 * @access  Admin
 */
export const getSettings = asyncHandler(async (req, res) => {
  let settings = await ShippingSettings.findOne();
  if (!settings) settings = await ShippingSettings.create({});

  sendResponse(res, { message: 'Shipping settings retrieved successfully', data: settings });
});

/**
 * @desc    Update shipping method toggles (admin)
 * @route   PUT /api/v1/admin/shipping-settings
 * @access  Admin
 */
export const updateSettings = asyncHandler(async (req, res) => {
  const { api, known, internal } = req.body;

  let settings = await ShippingSettings.findOne();
  if (!settings) settings = await ShippingSettings.create({});

  if (api !== undefined) settings.api = api;
  if (known !== undefined) settings.known = known;
  if (internal !== undefined) settings.internal = internal;

  await settings.save();
  sendResponse(res, { message: 'Settings updated successfully', data: settings });
});
