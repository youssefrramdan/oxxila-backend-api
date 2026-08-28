// src/controllers/category.controller.js
// Category CRUD with nested subcategories
import asyncHandler from 'express-async-handler';
import Category from '../models/Category.js';
import SubCategory from '../models/SubCategory.js';
import Product from '../models/Product.js';
import ApiError from '../utils/apiError.js';
import sendResponse from '../utils/apiResponse.js';
import ApiFeatures from '../utils/apiFeatures.js';
import {
  attachAuditToDoc,
  enrichDocsWithAudit,
  logAdminCreate,
  logAdminDelete,
  logAdminUpdate,
  stampAuditFields,
  withAuditPopulate,
} from '../utils/adminActivity.js';

/** Restrict public queries to active categories */
const activeFilter = { isActive: true };

/** Admin may pass ?includeInactive=true with a valid admin Bearer token */
const wantsInactive = (req) =>
  req.user?.role === 'admin' && String(req.query.includeInactive) === 'true';

/** Shared subcategory populate — active-only for storefront, all for admin */
const populateSubcategories = (includeInactive) => ({
  path: 'subcategories',
  match: includeInactive ? {} : { isActive: true },
  select: 'name slug image isActive',
  options: { sort: { name: 1 } },
});

/**
 * @desc    List categories with nested subcategories
 * @route   GET /api/v1/categories
 * @access  Public (admin + includeInactive=true → all, including hidden)
 */
export const getAllCategories = asyncHandler(async (req, res) => {
  const includeInactive = wantsInactive(req);
  const filter = includeInactive ? {} : activeFilter;

  const safeQuery = { ...req.query };
  delete safeQuery.isActive;
  delete safeQuery.includeInactive;

  const features = new ApiFeatures(
    Category.find(filter)
      .select('name slug image isActive subcategories createdBy updatedBy createdAt updatedAt')
      .populate(populateSubcategories(includeInactive)),
    safeQuery
  )
    .search(['name'])
    .sort();

  await features.paginate();

  let categories = await features.mongooseQuery.lean();
  if (includeInactive) {
    categories = await enrichDocsWithAudit(categories);
  }

  sendResponse(res, {
    message: 'Categories retrieved successfully',
    data: categories,
    pagination: { ...features.getPaginationResult(), results: categories.length },
  });
});

/**
 * @desc    Get one category (with nested subcategories)
 * @route   GET /api/v1/categories/:id
 * @access  Public (admin + includeInactive=true → inactive allowed)
 */
export const getCategory = asyncHandler(async (req, res, next) => {
  const includeInactive = wantsInactive(req);
  const filter = includeInactive
    ? { _id: req.params.id }
    : { _id: req.params.id, ...activeFilter };

  let query = Category.findOne(filter).populate(populateSubcategories(includeInactive));
  if (includeInactive) {
    query = withAuditPopulate(query);
  }

  const category = await query;
  if (!category) {
    return next(new ApiError(`No category found with id: ${req.params.id}`, 404));
  }

  const data = includeInactive ? attachAuditToDoc(category) : category;
  sendResponse(res, { message: 'Category retrieved successfully', data });
});

/**
 * @desc    Create category
 * @route   POST /api/v1/categories
 * @access  Admin
 */
export const createCategory = asyncHandler(async (req, res) => {
  if (req.file?.path) req.body.image = req.file.path;
  stampAuditFields(req.body, req, { isCreate: true });
  const category = await Category.create(req.body);
  logAdminCreate(req, { tab: 'categories', resourceType: 'category', doc: category });
  const populated = await withAuditPopulate(Category.findById(category._id)).populate(
    populateSubcategories(true)
  );
  sendResponse(res, {
    statusCode: 201,
    message: 'Category created successfully',
    data: attachAuditToDoc(populated),
  });
});

/**
 * @desc    Update category (name, image, isActive hide/show)
 * @route   PUT /api/v1/categories/:id
 * @access  Admin
 */
export const updateCategory = asyncHandler(async (req, res, next) => {
  if (req.file?.path) req.body.image = req.file.path;
  const previous = await Category.findById(req.params.id).lean();
  if (!previous) {
    return next(new ApiError(`No category found with id: ${req.params.id}`, 404));
  }

  stampAuditFields(req.body, req);
  const category = await withAuditPopulate(
    Category.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    })
  ).populate(populateSubcategories(true));

  logAdminUpdate(req, {
    tab: 'categories',
    resourceType: 'category',
    doc: category,
    previous,
  });

  sendResponse(res, {
    message: 'Category updated successfully',
    data: attachAuditToDoc(category),
  });
});

/**
 * @desc    Delete category and its sub-categories (blocked if products still reference it)
 * @route   DELETE /api/v1/categories/:id
 * @access  Admin
 */
export const deleteCategory = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const category = await Category.findById(id);
  if (!category) return next(new ApiError(`No category found with id: ${id}`, 404));

  const productCount = await Product.countDocuments({ category: id });
  if (productCount > 0) {
    return next(
      new ApiError(
        `Cannot delete category: ${productCount} product(s) still reference it. Reassign or remove those products first.`,
        400
      )
    );
  }

  logAdminDelete(req, { tab: 'categories', resourceType: 'category', doc: category });
  await SubCategory.deleteMany({ category: id });
  await category.deleteOne();
  sendResponse(res, { message: 'Category and its sub-categories deleted successfully' });
});
