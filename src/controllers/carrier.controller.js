// src/controllers/carrier.controller.js
import asyncHandler from 'express-async-handler';
import Carrier from '../models/Carrier.js';
import CarrierCoverage from '../models/CarrierCoverage.js';
import Governorate from '../models/Governorate.js';
import ApiError from '../utils/apiError.js';
import sendResponse from '../utils/apiResponse.js';

/**
 * @desc    List carriers with coverage summary (admin)
 * @route   GET /api/v1/admin/carriers
 * @access  Admin
 */
export const getCarriers = asyncHandler(async (req, res) => {
  const carriers = await Carrier.find().sort({ name: 1 });

  const coverages = await CarrierCoverage.find({
    carrier: { $in: carriers.map((c) => c._id) },
  }).populate('governorate', 'name');

  const data = carriers.map((c) => ({
    ...c.toObject(),
    coverage: coverages
      .filter((cv) => cv.carrier.toString() === c._id.toString())
      .map((cv) => cv.governorate?.name)
      .filter(Boolean),
  }));

  sendResponse(res, { message: 'Carriers retrieved successfully', data });
});

/**
 * @desc    Create known/internal carrier (admin)
 * @route   POST /api/v1/admin/carriers
 * @access  Admin
 */
export const createCarrier = asyncHandler(async (req, res, next) => {
  const { name, code, type, deliveryDays, logo, apiProvider, apiKey } = req.body;

  const exists = await Carrier.findOne({ code: code.toUpperCase() });
  if (exists) return next(new ApiError('Carrier code already exists', 400));

  const carrier = await Carrier.create({
    name,
    code,
    type,
    deliveryDays,
    logo,
    ...(type === 'api' ? { apiProvider, apiKey } : {}),
  });
  sendResponse(res, {
    statusCode: 201,
    message: 'Carrier created successfully',
    data: carrier,
  });
});

/**
 * @desc    Update carrier (admin)
 * @route   PUT /api/v1/admin/carriers/:id
 * @access  Admin
 */
export const updateCarrier = asyncHandler(async (req, res, next) => {
  delete req.body.type;
  delete req.body.apiProvider;

  const carrier = await Carrier.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  });
  if (!carrier) return next(new ApiError(`No carrier found with id: ${req.params.id}`, 404));

  sendResponse(res, { message: 'Carrier updated successfully', data: carrier });
});

/**
 * @desc    Delete carrier (admin, not API type)
 * @route   DELETE /api/v1/admin/carriers/:id
 * @access  Admin
 */
export const deleteCarrier = asyncHandler(async (req, res, next) => {
  const carrier = await Carrier.findById(req.params.id);
  if (!carrier) return next(new ApiError(`No carrier found with id: ${req.params.id}`, 404));

  await CarrierCoverage.deleteMany({ carrier: req.params.id });
  await Carrier.findByIdAndDelete(req.params.id);

  sendResponse(res, { message: 'Carrier deleted successfully' });
});

/**
 * @desc    Get carrier coverage rows (admin)
 * @route   GET /api/v1/admin/carriers/:id/coverage
 * @access  Admin
 */
export const getCarrierCoverage = asyncHandler(async (req, res, next) => {
  const carrier = await Carrier.findById(req.params.id);
  if (!carrier) return next(new ApiError(`No carrier found with id: ${req.params.id}`, 404));

  const coverage = await CarrierCoverage.find({ carrier: req.params.id }).populate(
    'governorate',
    'name'
  );

  sendResponse(res, { message: 'Carrier coverage retrieved successfully', data: coverage });
});

/**
 * @desc    Replace carrier coverage for governorates (admin)
 * @route   PUT /api/v1/admin/carriers/:id/coverage
 * @access  Admin
 */
export const updateCarrierCoverage = asyncHandler(async (req, res, next) => {
  const { governorateIds = [] } = req.body;

  const carrier = await Carrier.findById(req.params.id);
  if (!carrier) return next(new ApiError(`No carrier found with id: ${req.params.id}`, 404));

  const govs = await Governorate.find({ _id: { $in: governorateIds } });
  if (govs.length !== governorateIds.length) {
    return next(new ApiError('One or more governorate IDs are invalid', 400));
  }

  await CarrierCoverage.deleteMany({ carrier: req.params.id });

  if (governorateIds.length > 0) {
    await CarrierCoverage.insertMany(
      governorateIds.map((govId) => ({
        carrier: req.params.id,
        governorate: govId,
        isActive: true,
      }))
    );
  }

  sendResponse(res, {
    message: 'Coverage updated successfully',
    data: { count: governorateIds.length },
  });
});
