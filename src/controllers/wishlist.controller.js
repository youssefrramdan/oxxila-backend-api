// src/controllers/wishlist.controller.js
import asyncHandler from 'express-async-handler';
import Wishlist from '../models/Wishlist.js';
import Product from '../models/Product.js';
import ApiError from '../utils/apiError.js';
import sendResponse from '../utils/apiResponse.js';

const PRODUCT_SELECT = 'name images price priceAfterDiscount offerEndsAt stock isActive slug';

/** Load wishlist with populated products; drop items whose product is missing */
const getFormattedWishlist = async (userId) => {
  const wishlist = await Wishlist.findOne({ user: userId }).populate(
    'items.product',
    PRODUCT_SELECT
  );
  if (!wishlist) return { items: [] };

  const items = wishlist.items.filter((item) => item.product);
  return { _id: wishlist._id, items };
};

/**
 * @desc    Get the current user's wishlist
 * @route   GET /api/v1/wishlist
 * @access  Private
 */
export const getWishlist = asyncHandler(async (req, res) => {
  const data = await getFormattedWishlist(req.user._id);

  sendResponse(res, {
    message: 'Wishlist retrieved successfully',
    data,
  });
});

/**
 * @desc    Add a product to the wishlist
 * @route   POST /api/v1/wishlist
 * @access  Private
 */
export const addToWishlist = asyncHandler(async (req, res, next) => {
  const { productId } = req.body;

  const product = await Product.findById(productId);
  if (!product || !product.isActive) return next(new ApiError('Product not found', 404));

  let wishlist = await Wishlist.findOne({ user: req.user._id });

  if (!wishlist) {
    wishlist = await Wishlist.create({
      user: req.user._id,
      items: [{ product: productId }],
    });
  } else {
    const alreadyAdded = wishlist.items.some(
      (item) => item.product.toString() === productId
    );
    if (alreadyAdded) {
      return next(new ApiError('Product is already in wishlist', 400));
    }

    wishlist.items.push({ product: productId });
    await wishlist.save();
  }

  const data = await getFormattedWishlist(req.user._id);

  sendResponse(res, {
    statusCode: 201,
    message: 'Product added to wishlist',
    data,
  });
});

/**
 * @desc    Remove a product from the wishlist
 * @route   DELETE /api/v1/wishlist/:productId
 * @access  Private
 */
export const removeFromWishlist = asyncHandler(async (req, res, next) => {
  const { productId } = req.params;

  const wishlist = await Wishlist.findOne({ user: req.user._id });
  if (!wishlist) return next(new ApiError('Wishlist not found', 404));

  const item = wishlist.items.find((i) => i.product.toString() === productId);
  if (!item) return next(new ApiError('Product not found in wishlist', 404));

  item.deleteOne();
  await wishlist.save();

  const data = await getFormattedWishlist(req.user._id);

  sendResponse(res, {
    message: 'Product removed from wishlist',
    data,
  });
});

/**
 * @desc    Clear the entire wishlist
 * @route   DELETE /api/v1/wishlist
 * @access  Private
 */
export const clearWishlist = asyncHandler(async (req, res) => {
  await Wishlist.findOneAndDelete({ user: req.user._id });
  sendResponse(res, { message: 'Wishlist cleared' });
});
