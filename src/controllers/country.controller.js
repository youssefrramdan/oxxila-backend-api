// src/controllers/country.controller.js
import asyncHandler from 'express-async-handler';
import Country from '../models/Country.js';
import Governorate from '../models/Governorate.js';
import District from '../models/District.js';
import ApiError from '../utils/apiError.js';
import sendResponse from '../utils/apiResponse.js';
import {
  attachAuditToDoc,
  logAdminCreate,
  logAdminDelete,
  logAdminUpdate,
  stampAuditFields,
} from '../utils/adminActivity.js';

/**
 * @desc    List all countries (admin)
 * @route   GET /api/v1/admin/countries
 * @access  Admin
 */
export const getCountries = asyncHandler(async (req, res) => {
  const countries = await Country.find().sort({ name: 1 });
  sendResponse(res, { message: 'Countries retrieved successfully', data: countries });
});

/**
 * @desc    Create country
 * @route   POST /api/v1/admin/countries
 * @access  Admin
 */
export const createCountry = asyncHandler(async (req, res, next) => {
  const { name, code, currency, flag } = req.body;
  const exists = await Country.findOne({ code: code.toUpperCase() });
  if (exists) return next(new ApiError('Country code already exists', 400));

  const payload = { name, code, currency, flag };
  stampAuditFields(payload, req, { isCreate: true });
  const country = await Country.create(payload);
  logAdminCreate(req, { tab: 'shipping', resourceType: 'country', doc: country });
  sendResponse(res, {
    statusCode: 201,
    message: 'Country created successfully',
    data: attachAuditToDoc(country),
  });
});

/**
 * @desc    Update country
 * @route   PUT /api/v1/admin/countries/:id
 * @access  Admin
 */
export const updateCountry = asyncHandler(async (req, res, next) => {
  const previous = await Country.findById(req.params.id).lean();
  if (!previous) return next(new ApiError(`No country found with id: ${req.params.id}`, 404));

  stampAuditFields(req.body, req);
  const country = await Country.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  });

  logAdminUpdate(req, { tab: 'shipping', resourceType: 'country', doc: country, previous });

  sendResponse(res, { message: 'Country updated successfully', data: attachAuditToDoc(country) });
});

/**
 * @desc    Delete country and related governorates/districts
 * @route   DELETE /api/v1/admin/countries/:id
 * @access  Admin
 */
export const deleteCountry = asyncHandler(async (req, res, next) => {
  const country = await Country.findById(req.params.id);
  if (!country) return next(new ApiError(`No country found with id: ${req.params.id}`, 404));

  logAdminDelete(req, { tab: 'shipping', resourceType: 'country', doc: country });

  const governorates = await Governorate.find({ country: req.params.id });
  const govIds = governorates.map((g) => g._id);
  await District.deleteMany({ governorate: { $in: govIds } });
  await Governorate.deleteMany({ country: req.params.id });
  await Country.findByIdAndDelete(req.params.id);

  // Zone ObjectIds on users/orders/returns go stale; stored names remain so
  // resolveZoneRefs can rematch after the next Bosta zone sync (or on use).
  sendResponse(res, {
    message:
      'Country and all related data deleted successfully. Re-run Bosta zone sync to rematch saved addresses, orders, and returns by name.',
  });
});
