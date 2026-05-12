// src/controllers/review.controller.js
import asyncHandler from 'express-async-handler';
import Review from '../models/Review.js';
import Product from '../models/Product.js';
import ApiError from '../utils/apiError.js';
import sendResponse from '../utils/apiResponse.js';
import ApiFeatures from '../utils/apiFeatures.js';

// @desc    Get all reviews for a product
// @route   GET /api/v1/products/:productId/reviews
// @access  Public
export const getProductReviews = asyncHandler(async (req, res, next) => {
  const { productId } = req.params;

  const product = await Product.findById(productId).select('_id');
  if (!product) return next(new ApiError(`No product found with id: ${productId}`, 404));

  const query = Review.find({ product: productId }).populate('user', 'name avatar');

  const features = new ApiFeatures(query, req.query).sort();
  await features.paginate();

  const reviews = await features.mongooseQuery;

  sendResponse(res, {
    message: 'Reviews retrieved successfully',
    data: reviews,
    pagination: features.getPaginationResult(),
  });
});

// @desc    Get single review
// @route   GET /api/v1/reviews/:id
// @access  Public
export const getReview = asyncHandler(async (req, res, next) => {
  const review = await Review.findById(req.params.id).populate('user', 'name avatar');
  if (!review) return next(new ApiError(`No review found with id: ${req.params.id}`, 404));

  sendResponse(res, { message: 'Review retrieved successfully', data: review });
});

// @desc    Create review
// @route   POST /api/v1/products/:productId/reviews
// @access  Private (user, admin)
export const createReview = asyncHandler(async (req, res, next) => {
  const { productId } = req.params;

  const product = await Product.findById(productId);
  if (!product) return next(new ApiError(`No product found with id: ${productId}`, 404));
  if (!product.isActive) return next(new ApiError('Product is not available', 400));

  const existing = await Review.findOne({ user: req.user._id, product: productId });
  if (existing) return next(new ApiError('You have already reviewed this product', 400));

  const review = await Review.create({
    ...req.body,
    user: req.user._id,
    product: productId,
  });

  await review.populate('user', 'name avatar');

  sendResponse(res, {
    statusCode: 201,
    message: 'Review created successfully',
    data: review,
  });
});

// @desc    Update own review
// @route   PUT /api/v1/reviews/:id
// @access  Private (owner)
export const updateReview = asyncHandler(async (req, res, next) => {
  const review = await Review.findById(req.params.id);
  if (!review) return next(new ApiError(`No review found with id: ${req.params.id}`, 404));

  if (!review.user.equals(req.user._id)) {
    return next(new ApiError('You are not allowed to update this review', 403));
  }

  const { title, comment, rating } = req.body;
  if (title !== undefined) review.title = title;
  if (comment !== undefined) review.comment = comment;
  if (rating !== undefined) review.rating = rating;

  await review.save();

  await review.populate('user', 'name avatar');

  sendResponse(res, { message: 'Review updated successfully', data: review });
});

// @desc    Delete own review (or admin)
// @route   DELETE /api/v1/reviews/:id
// @access  Private (owner | admin)
export const deleteReview = asyncHandler(async (req, res, next) => {
  const review = await Review.findById(req.params.id);
  if (!review) return next(new ApiError(`No review found with id: ${req.params.id}`, 404));

  const isOwner = review.user.equals(req.user._id);
  const isAdmin = req.user.role === 'admin';

  if (!isOwner && !isAdmin) {
    return next(new ApiError('You are not allowed to delete this review', 403));
  }

  await Review.findOneAndDelete({ _id: req.params.id });

  sendResponse(res, { message: 'Review deleted successfully' });
});

// @desc    Toggle like on a review
// @route   POST /api/v1/reviews/:id/like
// @access  Private
export const toggleLike = asyncHandler(async (req, res, next) => {
  const review = await Review.findById(req.params.id);
  if (!review) return next(new ApiError(`No review found with id: ${req.params.id}`, 404));

  const userId = req.user._id;
  const alreadyLiked = review.likes.some((id) => id.equals(userId));

  if (alreadyLiked) {
    review.likes = review.likes.filter((id) => !id.equals(userId));
    review.likesCount = Math.max(0, review.likesCount - 1);
  } else {
    review.likes.push(userId);
    review.likesCount += 1;
  }

  await review.save();

  sendResponse(res, {
    message: alreadyLiked ? 'Review unliked successfully' : 'Review liked successfully',
    data: { likesCount: review.likesCount, liked: !alreadyLiked },
  });
});

// @desc    Get rating breakdown for a product
// @route   GET /api/v1/products/:productId/reviews/stats
// @access  Public
export const getProductRatingStats = asyncHandler(async (req, res, next) => {
  const { productId } = req.params;

  const product = await Product.findById(productId);
  if (!product) return next(new ApiError(`No product found with id: ${productId}`, 404));

  const stats = await Review.aggregate([
    { $match: { product: product._id } },
    {
      $group: {
        _id: '$rating',
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: -1 } },
  ]);

  const totalReviews = stats.reduce((acc, s) => acc + s.count, 0);
  const breakdown = [5, 4, 3, 2, 1].map((star) => {
    const found = stats.find((s) => s._id === star);
    const count = found ? found.count : 0;
    return {
      star,
      count,
      percentage: totalReviews > 0 ? Math.round((count / totalReviews) * 100) : 0,
    };
  });

  sendResponse(res, {
    message: 'Rating stats retrieved successfully',
    data: {
      ratingsAverage: product.ratingsAverage,
      ratingsQuantity: product.ratingsQuantity,
      breakdown,
    },
  });
});
