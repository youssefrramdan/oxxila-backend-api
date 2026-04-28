// src/controllers/subCategory.controller.js
import asyncHandler from 'express-async-handler';
import mongoose from 'mongoose';
import SubCategory from '../models/SubCategory.js';
import ApiError from '../utils/apiError.js';
import ApiFeatures from '../utils/apiFeatures.js';
import sendResponse from '../utils/apiResponse.js';

const publicFilter = { isActive: true };
const categoryPopulate = { path: 'category', select: 'name slug' };

/**
 * @desc    List sub-categories
 * @route   GET /api/v1/subcategories
 * @route   GET /api/v1/categories/:categoryId/subcategories
 * @access  Public
 */
export const getAllSubcategories = asyncHandler(async (req, res, next) => {
    const filter = req.filterObject ?? { ...publicFilter };

    if (!req.filterObject && req.query.category) {
      if (!mongoose.Types.ObjectId.isValid(req.query.category)) {
        return next(new ApiError('Invalid category id', 400));
      }
      filter.category = req.query.category;
    }

    const safeQuery = { ...req.query };
    delete safeQuery.isActive;
    delete safeQuery.category;

    const features = new ApiFeatures(
      SubCategory.find(filter).select('name slug image isActive category').populate(categoryPopulate),
      safeQuery
    )
      .search(['name'])
      .sort();

    const subcategories = await features.mongooseQuery;
    sendResponse(res, { message: 'Sub-categories retrieved successfully', data: subcategories });
  });

/**
 * @desc    Get one sub-category
 * @route   GET /api/v1/subcategories/:id
 * @route   GET /api/v1/categories/:categoryId/subcategories/:id
 * @access  Public
 */
export const getSubCategory = asyncHandler(async (req, res, next) => {
  const filter = {
    _id: req.params.id,
    isActive: true,
    ...(req.params.categoryId && { category: req.params.categoryId }),
  };

  const sub = await SubCategory.findOne(filter).populate(categoryPopulate);
  if (!sub) return next(new ApiError(`No sub-category found with id: ${req.params.id}`, 404));

  sendResponse(res, { message: 'Sub-category retrieved successfully', data: sub });
});

/**
 * @desc    Create sub-category
 * @route   POST /api/v1/categories/:categoryId/subcategories
 * @access  Private (admin)
 */
export const createSubCategory = asyncHandler(async (req, res) => {
  if (req.file?.path) req.body.image = req.file.path;

  const sub = await SubCategory.create(req.body);
  const populated = await sub.populate(categoryPopulate);

  sendResponse(res, { statusCode: 201, message: 'Sub-category created successfully', data: populated });
});

/**
 * @desc    Update sub-category
 * @route   PUT /api/v1/categories/:categoryId/subcategories/:id
 * @access  Private (admin)
 */
export const updateSubCategory = asyncHandler(async (req, res, next) => {
  if (req.file?.path) req.body.image = req.file.path;

  const sub = await SubCategory.findOneAndUpdate(
    { _id: req.params.id, category: req.params.categoryId },
    req.body,
    { new: true, runValidators: true }
  ).populate(categoryPopulate);

  if (!sub) return next(new ApiError(`No sub-category found with id: ${req.params.id}`, 404));

  sendResponse(res, { message: 'Sub-category updated successfully', data: sub });
});

/**
 * @desc    Delete sub-category
 * @route   DELETE /api/v1/categories/:categoryId/subcategories/:id
 * @access  Private (admin)
 */
export const deleteSubCategory = asyncHandler(async (req, res, next) => {
  const sub = await SubCategory.findOneAndDelete({
    _id: req.params.id,
    category: req.params.categoryId,
  });

  if (!sub) return next(new ApiError(`No sub-category found with id: ${req.params.id}`, 404));

  sendResponse(res, { message: 'Sub-category deleted successfully' });
});
