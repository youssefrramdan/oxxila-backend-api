// src/controllers/browsingHistory.controller.js
import asyncHandler from 'express-async-handler';
import User from '../models/User.js';
import Product from '../models/Product.js';
import ApiError from '../utils/apiError.js';
import sendResponse from '../utils/apiResponse.js';
import { buildPersonalRecommendations } from '../utils/recommendations.js';

const productSelect =
  'name nameEn nameAr slug images price priceAfterDiscount offerEndsAt views isCertified isActive ratingsAverage ratingsQuantity stock category subCategory brand concerns';

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
      // Archived/inactive products must not surface in storefront history carousels.
      match: { isActive: true },
      populate: [
        { path: 'category', select: 'name nameEn nameAr slug' },
        { path: 'brand', select: 'name nameEn nameAr slug logo' },
      ],
    });

  if (!user) return next(new ApiError(`No user found with id: ${req.user._id}`, 404));

  // Drop deleted (null populate) and inactive (match miss) entries.
  const history = user.browsingHistory
    .filter((h) => h.product)
    .sort((a, b) => b.viewedAt - a.viewedAt)
    .slice(0, 10);

  sendResponse(res, { message: 'Browsing history retrieved successfully', data: history });
});

/**
 * @desc    Get recommendations based on browsing history
 * @route   GET /api/v1/users/recommendations
 * @access  Private
 */
export const getRecommendations = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.user._id)
    .select('browsingHistory')
    .populate({
      path: 'browsingHistory.product',
      select: 'category subCategory brand concerns',
      match: { isActive: true },
    });

  if (!user) return next(new ApiError(`No user found with id: ${req.user._id}`, 404));

  // Newest first so recent interests weigh more (re-views only bump viewedAt).
  const history = [...user.browsingHistory].sort((a, b) => b.viewedAt - a.viewedAt);
  const data = await buildPersonalRecommendations({ userId: req.user._id, history });

  sendResponse(res, { message: 'Recommendations retrieved successfully', data });
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
