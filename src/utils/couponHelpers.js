// src/utils/couponHelpers.js
import Coupon from '../models/Coupon.js';
import ApiError from './apiError.js';

export const calculateCouponDiscount = (coupon, subtotal) => {
  const raw =
    coupon.discountType === 'percentage'
      ? (subtotal * coupon.discountValue) / 100
      : coupon.discountValue;

  return Math.round(Math.min(raw, subtotal) * 100) / 100;
};

export const isCouponValidForCart = (coupon, userId, subtotal) => {
  if (!coupon?.isActive) return false;
  if (coupon.expiresAt && coupon.expiresAt < new Date()) return false;
  if (coupon.maxUsage != null && coupon.usageCount >= coupon.maxUsage) return false;

  const alreadyUsed = coupon.usedBy?.some((id) => id.toString() === userId.toString());
  if (alreadyUsed) return false;

  if (subtotal <= 0 || subtotal < (coupon.minOrderAmount || 0)) return false;

  return true;
};

export const assertCouponApplicable = (coupon, userId, subtotal) => {
  if (!coupon?.isActive) return new ApiError('Invalid or inactive coupon', 400);
  if (coupon.expiresAt && coupon.expiresAt < new Date())
    return new ApiError('Coupon has expired', 400);
  if (coupon.maxUsage != null && coupon.usageCount >= coupon.maxUsage)
    return new ApiError('Coupon usage limit has been reached', 400);

  const alreadyUsed = coupon.usedBy?.some((id) => id.toString() === userId.toString());
  if (alreadyUsed) return new ApiError('You have already used this coupon', 400);

  if (subtotal <= 0) return new ApiError('Cart is empty', 400);

  if (subtotal < (coupon.minOrderAmount || 0)) {
    return new ApiError(
      `Minimum order amount for this coupon is ${coupon.minOrderAmount} EGP`,
      400
    );
  }

  return null;
};

export const findActiveCouponByCode = (code) =>
  Coupon.findOne({ code: String(code).toUpperCase(), isActive: true });

/** After checkout succeeds; skips if user already recorded (safe for retries). */
export const commitCouponUsage = async (couponId, userId) => {
  await Coupon.updateOne(
    { _id: couponId, usedBy: { $ne: userId } },
    { $addToSet: { usedBy: userId }, $inc: { usageCount: 1 } }
  );
};
