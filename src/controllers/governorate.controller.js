// src/controllers/governorate.controller.js
import asyncHandler from 'express-async-handler';
import mongoose from 'mongoose';
import Governorate from '../models/Governorate.js';
import District from '../models/District.js';
import Country from '../models/Country.js';
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
 * @desc    List governorates for a country (admin)
 * @route   GET /api/v1/admin/countries/:id/governorates
 * @access  Admin
 */
export const getGovernoratesByCountry = asyncHandler(async (req, res, next) => {
  const country = await Country.findById(req.params.id);
  if (!country) return next(new ApiError(`No country found with id: ${req.params.id}`, 404));

  const countryOid = new mongoose.Types.ObjectId(req.params.id);
  const governorates = await Governorate.aggregate([
    { $match: { country: countryOid } },
    { $sort: { name: 1 } },
    {
      $lookup: {
        from: District.collection.name,
        localField: '_id',
        foreignField: 'governorate',
        as: '_districts',
      },
    },
    { $addFields: { districtCount: { $size: '$_districts' } } },
    { $project: { _districts: 0 } },
  ]);
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

  const payload = { country, name, shippingPrice };
  stampAuditFields(payload, req, { isCreate: true });
  const governorate = await Governorate.create(payload);
  logAdminCreate(req, { tab: 'shipping', resourceType: 'governorate', doc: governorate });
  sendResponse(res, {
    statusCode: 201,
    message: 'Governorate created successfully',
    data: attachAuditToDoc(governorate),
  });
});

/**
 * @desc    Update governorate
 * @route   PUT /api/v1/admin/governorates/:id
 * @access  Admin
 */
export const updateGovernorate = asyncHandler(async (req, res, next) => {
  const previous = await Governorate.findById(req.params.id).lean();
  if (!previous) {
    return next(new ApiError(`No governorate found with id: ${req.params.id}`, 404));
  }

  stampAuditFields(req.body, req);
  const governorate = await Governorate.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  });

  logAdminUpdate(req, { tab: 'shipping', resourceType: 'governorate', doc: governorate, previous });

  sendResponse(res, { message: 'Governorate updated successfully', data: attachAuditToDoc(governorate) });
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

  logAdminDelete(req, { tab: 'shipping', resourceType: 'governorate', doc: governorate });

  await District.deleteMany({ governorate: req.params.id });
  await Governorate.findByIdAndDelete(req.params.id);
  sendResponse(res, { message: 'Governorate and its districts deleted successfully' });
});
