import asyncHandler from 'express-async-handler';
import Category from '../models/Category.js';
import SubCategory from '../models/SubCategory.js';
import ApiError from '../utils/apiError.js';
import sendResponse from '../utils/apiResponse.js';
import ApiFeatures from '../utils/apiFeatures.js';

const activeFilter = { isActive: true };

const populateSubcategories = {
    path: 'subcategories',
    match: { isActive: true },
    select: 'name slug image isActive',
    options: { sort: { name: 1 } },
  };

  export const getAllCategories = asyncHandler(async (req, res) => {
    const safeQuery = { ...req.query };
    delete safeQuery.isActive;

    const features = new ApiFeatures(
      Category.find({ isActive: true }).select('name slug image isActive subcategories').populate(populateSubcategories),
      safeQuery
    )
      .search(['name'])
      .sort();

    const categories = await features.mongooseQuery;
    sendResponse(res, { message: 'Categories retrieved successfully', data: categories });
  });

export const getCategory = asyncHandler(async (req, res, next) => {
  const category = await Category.findOne({ _id: req.params.id, ...activeFilter })
    .populate(populateSubcategories);
  if (!category) return next(new ApiError(`No category found with id: ${req.params.id}`, 404));
  sendResponse(res, { message: 'Category retrieved successfully', data: category });
});

export const createCategory = asyncHandler(async (req, res) => {
  if (req.file?.path) req.body.image = req.file.path;
  const category = await Category.create(req.body);
  sendResponse(res, { statusCode: 201, message: 'Category created successfully', data: category });
});

export const updateCategory = asyncHandler(async (req, res, next) => {
  if (req.file?.path) req.body.image = req.file.path;
  const category = await Category.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  });
  if (!category) return next(new ApiError(`No category found with id: ${req.params.id}`, 404));
  sendResponse(res, { message: 'Category updated successfully', data: category });
});

export const deleteCategory = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const category = await Category.findById(id);
  if (!category) return next(new ApiError(`No category found with id: ${id}`, 404));
  await SubCategory.deleteMany({ category: id });
  await category.deleteOne();
  sendResponse(res, { message: 'Category and its sub-categories deleted successfully' });
});
