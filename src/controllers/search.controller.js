// src/controllers/search.controller.js
import asyncHandler from 'express-async-handler';
import sendResponse from '../utils/apiResponse.js';
import { suggest } from '../utils/searchIndex.js';

/**
 * @desc    Search suggestions (products, brands, categories). Empty q → popular products.
 * @route   GET /api/v1/search/suggest?q=&limit=
 * @access  Public
 */
export const suggestSearch = asyncHandler(async (req, res) => {
  const q = String(req.query.q ?? '').slice(0, 80);
  const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 8, 1), 12);
  sendResponse(res, { message: 'Suggestions retrieved successfully', data: await suggest(q, limit) });
});
