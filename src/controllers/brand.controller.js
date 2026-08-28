// src/controllers/brand.controller.js
// Brand CRUD with category filtering
import asyncHandler from 'express-async-handler';
import mongoose from 'mongoose';
import Brand from '../models/Brand.js';
import ApiError from '../utils/apiError.js';
import ApiFeatures from '../utils/apiFeatures.js';
import sendResponse from '../utils/apiResponse.js';
import {
  attachAuditToDoc,
  logAdminCreate,
  logAdminDelete,
  logAdminUpdate,
  stampAuditFields,
  withAuditPopulate,
} from '../utils/adminActivity.js';

/** Restrict public queries to active brands */
const activeFilter = { isActive: true };

/** Shared category populate for brand responses */
const categoryPopulate = { path: 'category', select: 'name slug' };

/**
 * @desc    List active brands (optional category filter)
 * @route   GET /api/v1/brands
 * @access  Public
 */
export const getAllBrands = asyncHandler(async (req, res, next) => {
  const filter = { ...activeFilter };

  if (req.query.category) {
    if (!mongoose.Types.ObjectId.isValid(req.query.category)) {
      return next(new ApiError('Invalid category id', 400));
    }
    filter.category = req.query.category;
  }

  const safeQuery = { ...req.query };
  delete safeQuery.isActive;
  delete safeQuery.category;

  const features = new ApiFeatures(
    Brand.find(filter)
      .select('name slug logo description isActive category')
      .populate(categoryPopulate),
    safeQuery
  )
    .search(['name'])
    .sort();

  await features.paginate();

  const brands = await features.mongooseQuery.lean();
  sendResponse(res, {
    message: 'Brands retrieved successfully',
    data: brands,
    pagination: { ...features.getPaginationResult(), results: brands.length },
  });
});

/**
 * @desc    Get one active brand
 * @route   GET /api/v1/brands/:id
 * @access  Public
 */
export const getBrand = asyncHandler(async (req, res, next) => {
  const brand = await Brand.findOne({ _id: req.params.id, ...activeFilter }).populate(
    categoryPopulate
  );
  if (!brand) return next(new ApiError(`No brand found with id: ${req.params.id}`, 404));
  sendResponse(res, { message: 'Brand retrieved successfully', data: brand });
});

/**
 * @desc    Create brand
 * @route   POST /api/v1/brands
 * @access  Admin
 */
export const createBrand = asyncHandler(async (req, res) => {
  if (req.file?.path) req.body.logo = req.file.path;
  delete req.body.slug;
  stampAuditFields(req.body, req, { isCreate: true });
  const brand = await Brand.create(req.body);
  logAdminCreate(req, { tab: 'brands', resourceType: 'brand', doc: brand });
  const populated = await withAuditPopulate(Brand.findById(brand._id).populate(categoryPopulate));
  sendResponse(res, {
    statusCode: 201,
    message: 'Brand created successfully',
    data: attachAuditToDoc(populated),
  });
});

/**
 * @desc    Update brand
 * @route   PUT /api/v1/brands/:id
 * @access  Admin
 */
export const updateBrand = asyncHandler(async (req, res, next) => {
  if (req.file?.path) req.body.logo = req.file.path;
  delete req.body.slug;
  const previous = await Brand.findById(req.params.id).lean();
  if (!previous) return next(new ApiError(`No brand found with id: ${req.params.id}`, 404));

  stampAuditFields(req.body, req);
  const brand = await Brand.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  }).populate(categoryPopulate);

  logAdminUpdate(req, { tab: 'brands', resourceType: 'brand', doc: brand, previous });

  sendResponse(res, {
    message: 'Brand updated successfully',
    data: attachAuditToDoc(await withAuditPopulate(Brand.findById(brand._id).populate(categoryPopulate))),
  });
});

/**
 * @desc    Delete brand
 * @route   DELETE /api/v1/brands/:id
 * @access  Admin
 */
export const deleteBrand = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const brand = await Brand.findById(id);
  if (!brand) return next(new ApiError(`No brand found with id: ${id}`, 404));
  logAdminDelete(req, { tab: 'brands', resourceType: 'brand', doc: brand });
  await brand.deleteOne();
  sendResponse(res, { message: 'Brand deleted successfully' });
});
