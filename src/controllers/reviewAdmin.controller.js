// src/controllers/reviewAdmin.controller.js
import asyncHandler from 'express-async-handler';
import mongoose from 'mongoose';
import Review from '../models/Review.js';
import Order from '../models/Order.js';
import ApiError from '../utils/apiError.js';
import sendResponse from '../utils/apiResponse.js';
import ApiFeatures from '../utils/apiFeatures.js';

const DEFAULT_LIST_LIMIT = 10;
const DEFAULT_QUEUE_LIMIT = 5;
const FEEDBACK_SNIPPET_LEN = 120;
const VISIBLE_MATCH = { isVisible: true };
const PAID_ORDER_MATCH = { paymentStatus: 'paid', orderStatus: { $nin: ['cancelled'] } };

const parsePositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const roundPercent = (value) => Math.round(value * 10) / 10;

const reviewNotFound = (id) => new ApiError(`No review found with id: ${id}`, 404);

const moderationBadge = (status) => {
  if (status === 'flagged') return 'Flagged';
  if (status === 'resolved') return 'Resolved';
  return null;
};

const formatReviewRef = (id) => `#${String(id).slice(-4).toUpperCase()}`;

const snippet = (text, max = FEEDBACK_SNIPPET_LEN) => {
  const value = String(text || '').trim();
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
};

/** Count paid (non-cancelled) orders per user — batch helper. */
export const resolveUsersTotalOrders = async (userIds) => {
  const ids = [...new Set(userIds.map((id) => String(id)).filter(Boolean))];
  if (!ids.length) return new Map();

  const objectIds = ids.map((id) => new mongoose.Types.ObjectId(id));
  const rows = await Order.aggregate([
    {
      $match: {
        ...PAID_ORDER_MATCH,
        user: { $in: objectIds },
      },
    },
    { $group: { _id: '$user', totalOrders: { $sum: 1 } } },
  ]);

  return new Map(rows.map((row) => [String(row._id), row.totalOrders]));
};

export const resolveUserTotalOrders = async (userId) => {
  if (!userId) return 0;
  const map = await resolveUsersTotalOrders([userId]);
  return map.get(String(userId)) ?? 0;
};

const buildStarBreakdown = (stats) => {
  const totalReviews = stats.reduce((acc, s) => acc + s.count, 0);
  const average =
    totalReviews > 0
      ? roundPercent(stats.reduce((acc, s) => acc + s._id * s.count, 0) / totalReviews)
      : 0;

  const breakdown = [5, 4, 3, 2, 1].map((star) => {
    const found = stats.find((s) => s._id === star);
    const count = found ? found.count : 0;
    return {
      star,
      count,
      percentage: totalReviews > 0 ? Math.round((count / totalReviews) * 100) : 0,
    };
  });

  return {
    value: average,
    totalReviews,
    breakdown,
  };
};

const aggregateVisibleRatingStats = async () => {
  const stats = await Review.aggregate([
    { $match: VISIBLE_MATCH },
    { $group: { _id: '$rating', count: { $sum: 1 } } },
    { $sort: { _id: -1 } },
  ]);
  return buildStarBreakdown(stats);
};

const buildRatingDistribution = async () => {
  const [result] = await Review.aggregate([
    { $match: VISIBLE_MATCH },
    {
      $group: {
        _id: null,
        totalReviews: { $sum: 1 },
        positive: { $sum: { $cond: [{ $gte: ['$rating', 4] }, 1, 0] } },
        neutral: { $sum: { $cond: [{ $eq: ['$rating', 3] }, 1, 0] } },
        negative: { $sum: { $cond: [{ $lte: ['$rating', 2] }, 1, 0] } },
      },
    },
  ]);

  const totalReviews = result?.totalReviews ?? 0;
  const counts = {
    positive: result?.positive ?? 0,
    neutral: result?.neutral ?? 0,
    negative: result?.negative ?? 0,
  };

  const toPct = (n) => (totalReviews > 0 ? Math.round((n / totalReviews) * 100) : 0);

  return {
    positive: toPct(counts.positive),
    neutral: toPct(counts.neutral),
    negative: toPct(counts.negative),
    counts,
    totalReviews,
  };
};

const buildFlaggedQueue = async (limit) => {
  const [count, items] = await Promise.all([
    Review.countDocuments({ moderationStatus: 'flagged' }),
    Review.find({ moderationStatus: 'flagged' })
      .sort({ flaggedAt: -1 })
      .limit(limit)
      .select('comment flagReason flaggedAt')
      .lean(),
  ]);

  return {
    count,
    items: items.map((item) => ({
      id: item._id,
      reviewRef: formatReviewRef(item._id),
      snippet: snippet(item.comment),
      flagReason: item.flagReason,
      flaggedAt: item.flaggedAt,
    })),
  };
};

const tabFilter = (tab) => {
  switch (tab) {
    case 'visible':
      return { isVisible: true };
    case 'hidden':
      return { isVisible: false };
    case 'flagged':
      return { moderationStatus: 'flagged' };
    case 'resolved':
      return { moderationStatus: 'resolved' };
    default:
      return {};
  }
};

const mapListItem = (review, totalOrdersMap) => {
  const user = review.user;
  const product = review.product;
  return {
    id: review._id,
    user: {
      id: user?._id,
      name: user?.name ?? 'Unknown user',
      avatar: user?.avatar ?? '',
      totalOrders: totalOrdersMap.get(String(user?._id)) ?? 0,
    },
    product: {
      id: product?._id,
      name: product?.name ?? 'Unknown product',
    },
    rating: review.rating,
    feedback: snippet(review.comment),
    isVisible: review.isVisible,
    moderationStatus: review.moderationStatus,
    moderationBadge: moderationBadge(review.moderationStatus),
    flagReason: review.flagReason,
    resolvedNote: review.resolvedNote,
    createdAt: review.createdAt,
  };
};

const listAdminReviews = async (req) => {
  const tab = req.query.tab || 'all';
  const filter = tabFilter(tab);

  const query = Review.find(filter)
    .populate('user', 'name avatar')
    .populate('product', 'name');

  const features = new ApiFeatures(query, req.query).search(['comment', 'title']).sort();
  await features.paginate();

  const reviews = await features.mongooseQuery.lean();
  const totalOrdersMap = await resolveUsersTotalOrders(reviews.map((r) => r.user?._id).filter(Boolean));

  return {
    data: reviews.map((r) => mapListItem(r, totalOrdersMap)),
    pagination: features.getPaginationResult(),
  };
};

const mapAdminDetail = async (review) => {
  const user = review.user;
  const product = review.product;
  const flaggedBy = review.flaggedBy;
  const resolvedBy = review.resolvedBy;
  const totalOrders = await resolveUserTotalOrders(user?._id);

  return {
    id: review._id,
    title: review.title ?? null,
    comment: review.comment,
    rating: review.rating,
    likesCount: review.likesCount,
    isVisible: review.isVisible,
    moderationStatus: review.moderationStatus,
    moderationBadge: moderationBadge(review.moderationStatus),
    flagReason: review.flagReason,
    flaggedAt: review.flaggedAt,
    flaggedBy: flaggedBy
      ? { id: flaggedBy._id, name: flaggedBy.name }
      : null,
    resolvedAt: review.resolvedAt,
    resolvedBy: resolvedBy
      ? { id: resolvedBy._id, name: resolvedBy.name }
      : null,
    resolvedNote: review.resolvedNote,
    createdAt: review.createdAt,
    updatedAt: review.updatedAt,
    user: {
      id: user?._id,
      name: user?.name ?? 'Unknown user',
      email: user?.email ?? '',
      phone: user?.phone ?? '',
      avatar: user?.avatar ?? '',
      role: user?.role ?? 'user',
      active: user?.active ?? true,
      totalOrders,
      createdAt: user?.createdAt,
    },
    product: {
      id: product?._id,
      name: product?.name,
      slug: product?.slug,
      images: product?.images ?? [],
      price: product?.price,
      priceAfterDiscount: product?.priceAfterDiscount ?? null,
    },
  };
};

/**
 * @desc    Full admin reviews overview (all widgets)
 * @route   GET /api/v1/reviews/admin/overview
 * @access  Admin
 */
export const getReviewsAdminOverview = asyncHandler(async (req, res) => {
  const listQuery = { ...req.query, limit: req.query.limit || String(DEFAULT_LIST_LIMIT) };
  const queueLimit = parsePositiveInt(req.query.queueLimit, DEFAULT_QUEUE_LIMIT);

  const [averageRating, ratingDistribution, flaggedQueue, recentReviews] = await Promise.all([
    aggregateVisibleRatingStats(),
    buildRatingDistribution(),
    buildFlaggedQueue(queueLimit),
    listAdminReviews({ query: listQuery }),
  ]);

  sendResponse(res, {
    message: 'Reviews overview retrieved successfully',
    data: {
      averageRating,
      ratingDistribution,
      flaggedQueue,
      recentReviews,
    },
  });
});

/**
 * @desc    Store-wide average rating + star breakdown
 * @route   GET /api/v1/reviews/admin/summary
 * @access  Admin
 */
export const getReviewsAdminSummary = asyncHandler(async (req, res) => {
  const averageRating = await aggregateVisibleRatingStats();
  sendResponse(res, {
    message: 'Reviews summary retrieved successfully',
    data: averageRating,
  });
});

/**
 * @desc    Positive / Neutral / Negative distribution from ratings
 * @route   GET /api/v1/reviews/admin/rating-distribution
 * @access  Admin
 */
export const getReviewsAdminRatingDistribution = asyncHandler(async (req, res) => {
  const ratingDistribution = await buildRatingDistribution();
  sendResponse(res, {
    message: 'Rating distribution retrieved successfully',
    data: ratingDistribution,
  });
});

/**
 * @desc    Active flagged reviews queue
 * @route   GET /api/v1/reviews/admin/flagged
 * @access  Admin
 */
export const getReviewsAdminFlagged = asyncHandler(async (req, res) => {
  const limit = parsePositiveInt(req.query.limit, DEFAULT_QUEUE_LIMIT);
  const flaggedQueue = await buildFlaggedQueue(limit);
  sendResponse(res, {
    message: 'Flagged reviews retrieved successfully',
    data: flaggedQueue,
  });
});

/**
 * @desc    Paginated admin reviews list (tabs + keyword)
 * @route   GET /api/v1/reviews/admin
 * @access  Admin
 */
export const getReviewsAdminList = asyncHandler(async (req, res) => {
  const { data, pagination } = await listAdminReviews(req);
  sendResponse(res, {
    message: 'Reviews retrieved successfully',
    data,
    pagination,
  });
});

/**
 * @desc    Full review detail for admin view (eye icon)
 * @route   GET /api/v1/reviews/admin/:id
 * @access  Admin
 */
export const getReviewsAdminDetail = asyncHandler(async (req, res, next) => {
  const review = await Review.findById(req.params.id)
    .populate('user', 'name email phone avatar role active createdAt')
    .populate('product', 'name slug images price priceAfterDiscount')
    .populate('flaggedBy', 'name')
    .populate('resolvedBy', 'name');

  if (!review) return next(reviewNotFound(req.params.id));

  sendResponse(res, {
    message: 'Review details retrieved successfully',
    data: await mapAdminDetail(review),
  });
});

/**
 * @desc    Toggle review visibility on storefront
 * @route   PATCH /api/v1/reviews/:id/visibility
 * @access  Admin
 */
export const updateReviewVisibility = asyncHandler(async (req, res, next) => {
  const review = await Review.findById(req.params.id);
  if (!review) return next(reviewNotFound(req.params.id));

  review.isVisible = Boolean(req.body.isVisible);
  await review.save();

  sendResponse(res, {
    message: 'Review visibility updated successfully',
    data: {
      id: review._id,
      isVisible: review.isVisible,
      moderationStatus: review.moderationStatus,
      moderationBadge: moderationBadge(review.moderationStatus),
    },
  });
});

/**
 * @desc    Flag a review for moderation (admin only)
 * @route   POST /api/v1/reviews/:id/flag
 * @access  Admin
 */
export const flagReview = asyncHandler(async (req, res, next) => {
  const review = await Review.findById(req.params.id);
  if (!review) return next(reviewNotFound(req.params.id));

  if (review.moderationStatus === 'flagged') {
    return next(new ApiError('Review is already flagged', 400));
  }

  review.moderationStatus = 'flagged';
  review.flagReason = req.body.reason;
  review.flaggedAt = new Date();
  review.flaggedBy = req.user._id;
  review.resolvedAt = null;
  review.resolvedBy = null;
  review.resolvedNote = null;

  await review.save();

  sendResponse(res, {
    message: 'Review flagged successfully',
    data: {
      id: review._id,
      moderationStatus: review.moderationStatus,
      moderationBadge: moderationBadge(review.moderationStatus),
      flagReason: review.flagReason,
      flaggedAt: review.flaggedAt,
      isVisible: review.isVisible,
    },
  });
});

/**
 * @desc    Resolve a flagged review (keeps Resolved badge history)
 * @route   PATCH /api/v1/reviews/:id/flag/resolve
 * @access  Admin
 */
export const resolveReviewFlag = asyncHandler(async (req, res, next) => {
  const review = await Review.findById(req.params.id);
  if (!review) return next(reviewNotFound(req.params.id));

  if (review.moderationStatus !== 'flagged') {
    return next(new ApiError('Only flagged reviews can be resolved', 400));
  }

  review.moderationStatus = 'resolved';
  review.resolvedAt = new Date();
  review.resolvedBy = req.user._id;
  review.resolvedNote = req.body.resolvedNote?.trim() || null;

  await review.save();

  sendResponse(res, {
    message: 'Review flag resolved successfully',
    data: {
      id: review._id,
      moderationStatus: review.moderationStatus,
      moderationBadge: moderationBadge(review.moderationStatus),
      flagReason: review.flagReason,
      resolvedAt: review.resolvedAt,
      resolvedNote: review.resolvedNote,
      isVisible: review.isVisible,
    },
  });
});
