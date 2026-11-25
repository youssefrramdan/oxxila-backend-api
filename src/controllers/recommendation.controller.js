// src/controllers/recommendation.controller.js
import asyncHandler from 'express-async-handler';
import mongoose from 'mongoose';
import ApiError from '../utils/apiError.js';
import sendResponse from '../utils/apiResponse.js';
import { buildRelatedProducts, getProductsByIds } from '../utils/recommendations.js';

const clampLimit = (value, fallback, max) => {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, max) : fallback;
};

/**
 * @desc    Related products for a product page (public — guests get this too)
 * @route   GET /api/v1/products/:id/related
 * @access  Public
 */
export const getRelatedProducts = asyncHandler(async (req, res, next) => {
  const products = await buildRelatedProducts(req.params.id, clampLimit(req.query.limit, 12, 24));
  if (!products) return next(new ApiError('Product not found', 404));
  sendResponse(res, { message: 'Related products retrieved successfully', data: products });
});

/**
 * @desc    Hydrate product ids (guest browsing history kept in localStorage)
 * @route   POST /api/v1/products/by-ids
 * @access  Public
 */
export const getProductsByIdList = asyncHandler(async (req, res) => {
  const ids = (Array.isArray(req.body?.ids) ? req.body.ids : []).filter((id) =>
    mongoose.Types.ObjectId.isValid(String(id)),
  );
  const products = ids.length ? await getProductsByIds(ids, 20) : [];
  sendResponse(res, { message: 'Products retrieved successfully', data: products });
});
