// src/controllers/brand.controller.js
import asyncHandler from 'express-async-handler';
import Brand from '../models/Brand.js';
import ApiError from '../utils/apiError.js';
import ApiFeatures from '../utils/apiFeatures.js';
import sendResponse from '../utils/apiResponse.js';

const activeFilter = { isActive: true };

export const getAllBrands = asyncHandler(async (req, res) => {
  const filter = { ...activeFilter };

  const safeQuery = { ...req.query };
  delete safeQuery.isActive;

  const features = new ApiFeatures(
    Brand.find(filter).select('name slug logo description isActive'),
    safeQuery
  )
    .search(['name'])
    .sort();

  const brands = await features.mongooseQuery;
  sendResponse(res, { message: 'Brands retrieved successfully', data: brands });
});

export const getBrand = asyncHandler(async (req, res, next) => {
  const brand = await Brand.findOne({ _id: req.params.id, ...activeFilter });
  if (!brand) return next(new ApiError(`No brand found with id: ${req.params.id}`, 404));
  sendResponse(res, { message: 'Brand retrieved successfully', data: brand });
});

export const createBrand = asyncHandler(async (req, res) => {
  if (req.file?.path) req.body.logo = req.file.path;
  delete req.body.slug;
  const brand = await Brand.create(req.body);
  sendResponse(res, { statusCode: 201, message: 'Brand created successfully', data: brand });
});

export const updateBrand = asyncHandler(async (req, res, next) => {
  if (req.file?.path) req.body.logo = req.file.path;
  delete req.body.slug;
  const brand = await Brand.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  });
  if (!brand) return next(new ApiError(`No brand found with id: ${req.params.id}`, 404));
  sendResponse(res, { message: 'Brand updated successfully', data: brand });
});

export const deleteBrand = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const brand = await Brand.findById(id);
  if (!brand) return next(new ApiError(`No brand found with id: ${id}`, 404));
  await brand.deleteOne();
  sendResponse(res, { message: 'Brand deleted successfully' });
});
