// src/middlewares/catalogNested.middleware.js
import mongoose from 'mongoose';
import asyncHandler from 'express-async-handler';
import Category from '../models/Category.js';
import ApiError from '../utils/apiError.js';

/**
 * Fills `req.body.category` from the parent `/:categoryId` when posting nested
 * (mirrors a similar pattern for nested resources under categories).
 */
export const setSubcategoryCategoryFromParam = (req, res, next) => {
  if (!req.body?.category && req.params?.categoryId) {
    req.body = req.body || {};
    req.body.category = req.params.categoryId;
  }
  next();
};

/** Admin may pass ?includeInactive=true with a valid admin Bearer token */
const wantsInactive = (req) =>
  req.user?.role === 'admin' && String(req.query.includeInactive) === 'true';

/**
 * `GET /:categoryId/subcategories` — filter to this parent only.
 * Public: active subs only. Admin + includeInactive=true: all subs.
 */
export const createNestedSubCategoryFilter = (req, res, next) => {
  if (!req.params?.categoryId) {
    return next();
  }
  if (!mongoose.Types.ObjectId.isValid(req.params.categoryId)) {
    return next(new ApiError('Invalid category id', 400));
  }
  const includeInactive = wantsInactive(req);
  req.filterObject = {
    ...(includeInactive ? {} : { isActive: true }),
    category: req.params.categoryId,
  };
  next();
};

/**
 * Nested reads: parent must exist. Public requires active parent;
 * admin + includeInactive=true allows inactive parent.
 */
export const requireActiveParentCategory = asyncHandler(async (req, res, next) => {
  const { categoryId } = req.params;
  if (!categoryId) return next();
  const parent = await Category.findById(categoryId);
  if (!parent) {
    return next(new ApiError(`No category found with id: ${categoryId}`, 404));
  }
  if (!wantsInactive(req) && !parent.isActive) {
    return next(new ApiError(`No category found with id: ${categoryId}`, 404));
  }
  next();
});

/**
 * Admin nested writes: parent must exist (inactive allowed).
 */
export const requireParentCategoryForAdmin = asyncHandler(async (req, res, next) => {
  const { categoryId } = req.params;
  if (!categoryId) {
    return next(new ApiError('Category id is required', 400));
  }
  const parent = await Category.findById(categoryId);
  if (!parent) {
    return next(new ApiError(`No category found with id: ${categoryId}`, 404));
  }
  next();
});
