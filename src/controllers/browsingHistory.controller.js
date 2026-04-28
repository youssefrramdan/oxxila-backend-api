// src/controllers/browsingHistory.controller.js
import asyncHandler from 'express-async-handler';
import User from '../models/User.js';
import Product from '../models/Product.js';
import ApiError from '../utils/apiError.js';
import sendResponse from '../utils/apiResponse.js';

const productSelect =
  'name slug images price priceAfterDiscount ratingsAverage views isCertified category';

/**
 * @desc    Get browsing history
 * @route   GET /api/v1/users/browsing-history
 * @access  Private
 */
export const getBrowsingHistory = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.user._id)
    .select('browsingHistory')
    .populate({
      path: 'browsingHistory.product',
      select: productSelect,
      populate: { path: 'category', select: 'name slug' },
    });

  if (!user) return next(new ApiError(`No user found with id: ${req.user._id}`, 404));

  const history = user.browsingHistory.filter((h) => h.product).slice(0, 10);

  sendResponse(res, { message: 'Browsing history retrieved successfully', data: history });
});

/**
 * @desc    Get recommendations based on browsing history
 * @route   GET /api/v1/users/recommendations
 * @access  Private
 */
export const getRecommendations = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.user._id).select('browsingHistory');

  if (!user) return next(new ApiError(`No user found with id: ${req.user._id}`, 404));

  if (!user.browsingHistory.length) {
    return sendResponse(res, { message: 'No recommendations yet', data: [] });
  }

  const categoryCount = {};
  const viewedProductIds = [];

  user.browsingHistory.forEach((h) => {
    const catId = h.category.toString();
    categoryCount[catId] = (categoryCount[catId] || 0) + 1;
    viewedProductIds.push(h.product);
  });

  const topCategories = Object.entries(categoryCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([id]) => id);

  const products = await Product.find({
    category: { $in: topCategories },
    _id: { $nin: viewedProductIds },
    isActive: true,
  })
    .select(productSelect)
    .populate({ path: 'category', select: 'name slug' })
    .sort({ views: -1, ratingsAverage: -1 })
    .limit(20);

  sendResponse(res, { message: 'Recommendations retrieved successfully', data: products });
});

/**
 * @desc    Clear browsing history
 * @route   DELETE /api/v1/users/browsing-history
 * @access  Private
 */
export const clearBrowsingHistory = asyncHandler(async (req, res) => {
  await User.findByIdAndUpdate(req.user._id, { $set: { browsingHistory: [] } });
  sendResponse(res, { message: 'Browsing history cleared successfully' });
});
