// src/controllers/district.controller.js
import asyncHandler from 'express-async-handler';
import District from '../models/District.js';
import Governorate from '../models/Governorate.js';
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
 * @desc    List districts for a governorate (admin)
 * @route   GET /api/v1/admin/governorates/:id/districts
 * @access  Admin
 */
export const getDistrictsByGovernorate = asyncHandler(async (req, res, next) => {
  const governorate = await Governorate.findById(req.params.id);
  if (!governorate) {
    return next(new ApiError(`No governorate found with id: ${req.params.id}`, 404));
  }

  const districts = await District.find({ governorate: req.params.id }).sort({ name: 1 });
  sendResponse(res, { message: 'Districts retrieved successfully', data: districts });
});

/**
 * @desc    Create district
 * @route   POST /api/v1/admin/districts
 * @access  Admin
 */
export const createDistrict = asyncHandler(async (req, res, next) => {
  delete req.body.bostaCovered;
  const { governorate, name, shippingPrice } = req.body;
  const govExists = await Governorate.findById(governorate);
  if (!govExists) return next(new ApiError(`No governorate found with id: ${governorate}`, 404));

  const payload = { governorate, name, shippingPrice };
  stampAuditFields(payload, req, { isCreate: true });
  const district = await District.create(payload);
  logAdminCreate(req, { tab: 'shipping', resourceType: 'district', doc: district });
  sendResponse(res, {
    statusCode: 201,
    message: 'District created successfully',
    data: attachAuditToDoc(district),
  });
});

/**
 * @desc    Update district
 * @route   PUT /api/v1/admin/districts/:id
 * @access  Admin
 */
export const updateDistrict = asyncHandler(async (req, res, next) => {
  delete req.body.bostaCovered;
  const previous = await District.findById(req.params.id).lean();
  if (!previous) return next(new ApiError(`No district found with id: ${req.params.id}`, 404));

  stampAuditFields(req.body, req);
  const district = await District.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  });

  logAdminUpdate(req, { tab: 'shipping', resourceType: 'district', doc: district, previous });

  sendResponse(res, { message: 'District updated successfully', data: attachAuditToDoc(district) });
});

/**
 * @desc    Delete district
 * @route   DELETE /api/v1/admin/districts/:id
 * @access  Admin
 */
export const deleteDistrict = asyncHandler(async (req, res, next) => {
  const district = await District.findById(req.params.id);
  if (!district) return next(new ApiError(`No district found with id: ${req.params.id}`, 404));

  logAdminDelete(req, { tab: 'shipping', resourceType: 'district', doc: district });
  await district.deleteOne();

  sendResponse(res, { message: 'District deleted successfully' });
});
