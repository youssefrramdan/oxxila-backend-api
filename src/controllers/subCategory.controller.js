// src/controllers/subCategory.controller.js
import asyncHandler from 'express-async-handler';
import mongoose from 'mongoose';
import SubCategory from '../models/SubCategory.js';
import Product from '../models/Product.js';
import ApiError from '../utils/apiError.js';
import ApiFeatures from '../utils/apiFeatures.js';
import sendResponse from '../utils/apiResponse.js';
import {
  attachAuditToDoc,
  enrichDocsWithAudit,
  logAdminCreate,
  logAdminDelete,
  logAdminUpdate,
  stampAuditFields,
  withAuditPopulate,
} from '../utils/adminActivity.js';

const publicFilter = { isActive: true };
const categoryPopulate = { path: 'category', select: 'name slug isActive' };

/** Admin may pass ?includeInactive=true with a valid admin Bearer token */
const wantsInactive = (req) =>
  req.user?.role === 'admin' && String(req.query.includeInactive) === 'true';

/**
 * @desc    List sub-categories
 * @route   GET /api/v1/subcategories
 * @route   GET /api/v1/categories/:categoryId/subcategories
 * @access  Public (admin + includeInactive=true → all, including hidden)
 */
export const getAllSubcategories = asyncHandler(async (req, res, next) => {
  const includeInactive = wantsInactive(req);
  let filter = req.filterObject;

  if (!filter) {
    filter = includeInactive ? {} : { ...publicFilter };

    if (req.query.category) {
      if (!mongoose.Types.ObjectId.isValid(req.query.category)) {
        return next(new ApiError('Invalid category id', 400));
      }
      filter.category = req.query.category;
    }
  }

  const safeQuery = { ...req.query };
  delete safeQuery.isActive;
  delete safeQuery.category;
  delete safeQuery.includeInactive;

  const features = new ApiFeatures(
    SubCategory.find(filter)
      .select('name slug image isActive category createdBy updatedBy createdAt updatedAt')
      .populate(categoryPopulate),
    safeQuery
  )
    .search(['name'])
    .sort();

  const subcategories = await features.mongooseQuery.lean();
  const data = includeInactive ? await enrichDocsWithAudit(subcategories) : subcategories;
  sendResponse(res, {
    message: 'Sub-categories retrieved successfully',
    data,
  });
});

/**
 * @desc    Get one sub-category
 * @route   GET /api/v1/subcategories/:id
 * @route   GET /api/v1/categories/:categoryId/subcategories/:id
 * @access  Public (admin + includeInactive=true → inactive allowed)
 */
export const getSubCategory = asyncHandler(async (req, res, next) => {
  const includeInactive = wantsInactive(req);
  const filter = {
    _id: req.params.id,
    ...(includeInactive ? {} : { isActive: true }),
    ...(req.params.categoryId && { category: req.params.categoryId }),
  };

  let query = SubCategory.findOne(filter).populate(categoryPopulate);
  if (includeInactive) query = withAuditPopulate(query);

  const sub = await query;
  if (!sub) {
    return next(new ApiError(`No sub-category found with id: ${req.params.id}`, 404));
  }

  const data = includeInactive ? attachAuditToDoc(sub) : sub;
  sendResponse(res, { message: 'Sub-category retrieved successfully', data });
});

/**
 * @desc    Create sub-category
 * @route   POST /api/v1/categories/:categoryId/subcategories
 * @access  Private (admin)
 */
export const createSubCategory = asyncHandler(async (req, res) => {
  if (req.file?.path) req.body.image = req.file.path;
  stampAuditFields(req.body, req, { isCreate: true });

  const sub = await SubCategory.create(req.body);
  logAdminCreate(req, { tab: 'categories', resourceType: 'subCategory', doc: sub });
  const populated = await withAuditPopulate(
    SubCategory.findById(sub._id).populate(categoryPopulate)
  );

  sendResponse(res, {
    statusCode: 201,
    message: 'Sub-category created successfully',
    data: attachAuditToDoc(populated),
  });
});

/**
 * @desc    Update sub-category (name, image, isActive hide/show, optional re-parent)
 * @route   PUT /api/v1/categories/:categoryId/subcategories/:id
 * @access  Private (admin)
 */
export const updateSubCategory = asyncHandler(async (req, res, next) => {
  if (req.file?.path) req.body.image = req.file.path;

  const previous = await SubCategory.findOne({
    _id: req.params.id,
    category: req.params.categoryId,
  }).lean();
  if (!previous) {
    return next(new ApiError(`No sub-category found with id: ${req.params.id}`, 404));
  }

  stampAuditFields(req.body, req);
  const sub = await SubCategory.findOneAndUpdate(
    { _id: req.params.id, category: req.params.categoryId },
    req.body,
    { new: true, runValidators: true }
  ).populate(categoryPopulate);

  logAdminUpdate(req, {
    tab: 'categories',
    resourceType: 'subCategory',
    doc: sub,
    previous,
  });

  sendResponse(res, {
    message: 'Sub-category updated successfully',
    data: attachAuditToDoc(await withAuditPopulate(SubCategory.findById(sub._id).populate(categoryPopulate))),
  });
});

/**
 * @desc    Delete sub-category (blocked if products still reference it)
 * @route   DELETE /api/v1/categories/:categoryId/subcategories/:id
 * @access  Private (admin)
 */
export const deleteSubCategory = asyncHandler(async (req, res, next) => {
  const productCount = await Product.countDocuments({ subCategory: req.params.id });
  if (productCount > 0) {
    return next(
      new ApiError(
        `Cannot delete sub-category: ${productCount} product(s) still reference it. Reassign or remove those products first.`,
        400
      )
    );
  }

  const sub = await SubCategory.findOne({
    _id: req.params.id,
    category: req.params.categoryId,
  });

  if (!sub) {
    return next(new ApiError(`No sub-category found with id: ${req.params.id}`, 404));
  }

  logAdminDelete(req, { tab: 'categories', resourceType: 'subCategory', doc: sub });
  await sub.deleteOne();

  sendResponse(res, { message: 'Sub-category deleted successfully' });
});
