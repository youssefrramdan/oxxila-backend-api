// src/controllers/coupon.controller.js
import asyncHandler from 'express-async-handler';
import Coupon from '../models/Coupon.js';
import ApiError from '../utils/apiError.js';
import sendResponse from '../utils/apiResponse.js';
import ApiFeatures from '../utils/apiFeatures.js';

/**
 * Call after an order is successfully placed with this coupon.
 * Does not increment usage if this user is already recorded (safe for retries).
 */
export const commitCouponUsage = async (couponId, userId) => {
  await Coupon.updateOne(
    { _id: couponId, usedBy: { $ne: userId } },
    { $addToSet: { usedBy: userId }, $inc: { usageCount: 1 } }
  );
};

/**
 * @desc    List coupons (admin)
 * @route   GET /api/v1/coupons
 * @access  Admin
 */
export const getCoupons = asyncHandler(async (req, res) => {
  const features = new ApiFeatures(Coupon.find(), req.query).filter().sort().limitFields();

  await features.paginate();

  const coupons = await features.mongooseQuery;
  const pagination = features.getPaginationResult();

  sendResponse(res, {
    message: 'Coupons retrieved successfully',
    data: coupons,
    pagination: { ...pagination, results: coupons.length },
  });
});

/**
 * @desc    Get one coupon
 * @route   GET /api/v1/coupons/:id
 * @access  Admin
 */
export const getCoupon = asyncHandler(async (req, res, next) => {
  const coupon = await Coupon.findById(req.params.id);
  if (!coupon) return next(new ApiError(`No coupon found with id: ${req.params.id}`, 404));

  sendResponse(res, { message: 'Coupon retrieved successfully', data: coupon });
});

/**
 * @desc    Create coupon
 * @route   POST /api/v1/coupons
 * @access  Admin
 */
export const createCoupon = asyncHandler(async (req, res) => {
  if (req.body.code) req.body.code = String(req.body.code).toUpperCase();

  const coupon = await Coupon.create(req.body);
  sendResponse(res, {
    statusCode: 201,
    message: 'Coupon created successfully',
    data: coupon,
  });
});

/**
 * @desc    Update coupon
 * @route   PUT /api/v1/coupons/:id
 * @access  Admin
 */
export const updateCoupon = asyncHandler(async (req, res, next) => {
  if (req.body.code) req.body.code = String(req.body.code).toUpperCase();

  const coupon = await Coupon.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  });
  if (!coupon) return next(new ApiError(`No coupon found with id: ${req.params.id}`, 404));

  sendResponse(res, { message: 'Coupon updated successfully', data: coupon });
});

/**
 * @desc    Delete coupon
 * @route   DELETE /api/v1/coupons/:id
 * @access  Admin
 */
export const deleteCoupon = asyncHandler(async (req, res, next) => {
  const coupon = await Coupon.findByIdAndDelete(req.params.id);
  if (!coupon) return next(new ApiError(`No coupon found with id: ${req.params.id}`, 404));

  sendResponse(res, { message: 'Coupon deleted successfully' });
});

/**
 * @desc    Validate coupon and return discount preview (does not persist usage)
 * @route   POST /api/v1/coupons/apply
 * @access  Private
 */
export const applyCoupon = asyncHandler(async (req, res, next) => {
  const { code, orderAmount } = req.body;

  const coupon = await Coupon.findOne({
    code: String(code).toUpperCase(),
    isActive: true,
  });

  if (!coupon) return next(new ApiError('Invalid or inactive coupon', 400));

  if (coupon.expiresAt && new Date() > coupon.expiresAt) {
    return next(new ApiError('Coupon has expired', 400));
  }

  if (coupon.maxUsage != null && coupon.usageCount >= coupon.maxUsage) {
    return next(new ApiError('Coupon usage limit has been reached', 400));
  }

  const alreadyUsed = coupon.usedBy.some((id) => id.toString() === req.user._id.toString());
    if (alreadyUsed) return next(new ApiError('You have already used this coupon', 400));

    if (orderAmount < coupon.minOrderAmount) {
        return next(
        new ApiError(`Minimum order amount for this coupon is ${coupon.minOrderAmount} EGP`, 400)
        );
    }

    let discountAmount = 0;
    if (coupon.discountType === 'percentage') {
        discountAmount = (orderAmount * coupon.discountValue) / 100;
    } else {
        discountAmount = Math.min(coupon.discountValue, orderAmount);
    }

  const finalAmount = Math.max(0, orderAmount - discountAmount);

  sendResponse(res, {
    message: 'Coupon applied successfully',
    data: {
      code: coupon.code,
      discountType: coupon.discountType,
      discountValue: coupon.discountValue,
      discountAmount: Math.round(discountAmount * 100) / 100,
      finalAmount: Math.round(finalAmount * 100) / 100,
      couponId: coupon._id,
    },
  });
});
