// src/controllers/shipping.controller.js
import asyncHandler from 'express-async-handler';
import Country from '../models/Country.js';
import Governorate from '../models/Governorate.js';
import District from '../models/District.js';
import sendResponse from '../utils/apiResponse.js';
import ApiError from '../utils/apiError.js';
import { resolveShipping } from './order.controller.js';

/** Mongo filter for active countries */
const activeCountryFilter = { isActive: true };

/**
 * @desc    Active countries for checkout
 * @route   GET /api/v1/shipping/countries
 * @access  Public
 */
export const getCountries = asyncHandler(async (req, res) => {
  const countries = await Country.find(activeCountryFilter)
    .select('name code flag currency')
    .sort({ name: 1 });
  sendResponse(res, { message: 'Countries retrieved successfully', data: countries });
});

/**
 * @desc    Active governorates for a country
 * @route   GET /api/v1/shipping/countries/:id/governorates
 * @access  Public
 */
export const getGovernorates = asyncHandler(async (req, res, next) => {
  const country = await Country.findOne({ _id: req.params.id, ...activeCountryFilter });
  if (!country) return next(new ApiError(`No country found with id: ${req.params.id}`, 404));

  const governorates = await Governorate.find({ country: req.params.id, isActive: true })
    .select('name shippingPrice')
    .sort({ name: 1 });
  sendResponse(res, { message: 'Governorates retrieved successfully', data: governorates });
});

/**
 * @desc    District zones (or governorate-only price) for checkout
 * @route   GET /api/v1/shipping/governorates/:id/zones
 * @access  Public
 */
export const getZones = asyncHandler(async (req, res, next) => {
  const governorate = await Governorate.findOne({ _id: req.params.id, isActive: true });
  if (!governorate) {
    return next(new ApiError(`No governorate found with id: ${req.params.id}`, 404));
  }

  const districts = await District.find({ governorate: req.params.id, isCovered: true })
    .select('name shippingPrice')
    .sort({ name: 1 });

  if (districts.length === 0) {
    return sendResponse(res, {
      message: 'Shipping zones retrieved successfully',
      data: { hasDistricts: false, shippingPrice: governorate.shippingPrice },
    });
  }

  sendResponse(res, {
    message: 'Shipping zones retrieved successfully',
    data: {
      hasDistricts: true,
      districts,
      other: { label: 'Other', shippingPrice: governorate.shippingPrice },
    },
  });
});

/**
 * @desc    Resolve shipping price for governorate + optional district
 * @route   GET /api/v1/shipping/resolve
 * @access  Public
 */
export const resolveShippingPrice = asyncHandler(async (req, res, next) => {
  const { governorateId, districtId } = req.query;
  if (!governorateId) return next(new ApiError('governorateId is required', 400));

  const data = await resolveShipping({ governorateId, districtId });

  sendResponse(res, { message: 'Shipping price resolved successfully', data });
});
