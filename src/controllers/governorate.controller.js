// src/controllers/governorate.controller.js
import asyncHandler from 'express-async-handler';
import Governorate from '../models/Governorate.js';
import District from '../models/District.js';
import Country from '../models/Country.js';
import ApiError from '../utils/apiError.js';
import sendResponse from '../utils/apiResponse.js';

/**
 * @desc    List governorates for a country (admin)
 * @route   GET /api/v1/admin/countries/:id/governorates
 * @access  Admin
 */
export const getGovernoratesByCountry = asyncHandler(async (req, res, next) => {
  const country = await Country.findById(req.params.id);
  if (!country) return next(new ApiError(`No country found with id: ${req.params.id}`, 404));

  const governorates = await Governorate.find({ country: req.params.id }).sort({ name: 1 });
  sendResponse(res, { message: 'Governorates retrieved successfully', data: governorates });
});

/**
 * @desc    Create governorate
 * @route   POST /api/v1/admin/governorates
 * @access  Admin
 */
export const createGovernorate = asyncHandler(async (req, res, next) => {
  const { country, name, shippingPrice } = req.body;
  const countryExists = await Country.findById(country);
  if (!countryExists) return next(new ApiError(`No country found with id: ${country}`, 404));

  const governorate = await Governorate.create({ country, name, shippingPrice });
  sendResponse(res, {
    statusCode: 201,
    message: 'Governorate created successfully',
    data: governorate,
  });
});

/**
 * @desc    Update governorate
 * @route   PUT /api/v1/admin/governorates/:id
 * @access  Admin
 */
export const updateGovernorate = asyncHandler(async (req, res, next) => {
  const governorate = await Governorate.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  });
  if (!governorate) {
    return next(new ApiError(`No governorate found with id: ${req.params.id}`, 404));
  }
  sendResponse(res, { message: 'Governorate updated successfully', data: governorate });
});

/**
 * @desc    Delete governorate and its districts
 * @route   DELETE /api/v1/admin/governorates/:id
 * @access  Admin
 */
export const deleteGovernorate = asyncHandler(async (req, res, next) => {
  const governorate = await Governorate.findById(req.params.id);
  if (!governorate) {
    return next(new ApiError(`No governorate found with id: ${req.params.id}`, 404));
  }

  await District.deleteMany({ governorate: req.params.id });
  await Governorate.findByIdAndDelete(req.params.id);
  sendResponse(res, { message: 'Governorate and its districts deleted successfully' });
});
