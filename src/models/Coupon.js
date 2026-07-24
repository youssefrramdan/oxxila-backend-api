// src/models/Coupon.js
import mongoose from 'mongoose';

export const COUPON_DISCOUNT_TYPES = ['percentage', 'fixed', 'freeShipping'];

const couponSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: [true, 'Coupon code is required'],
      unique: true,
      uppercase: true,
      trim: true,
      minlength: [3, 'Coupon code must be at least 3 characters'],
      maxlength: [20, 'Coupon code cannot exceed 20 characters'],
    },
    discountType: {
      type: String,
      enum: COUPON_DISCOUNT_TYPES,
      required: [true, 'Discount type is required'],
    },
    discountValue: {
      type: Number,
      required: [true, 'Discount value is required'],
      min: [0, 'Discount value must be positive'],
      default: 0,
    },
    maxUsage: {
      type: Number,
      default: null,
    },
    usageCount: {
      type: Number,
      default: 0,
    },
    usedBy: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    expiresAt: {
      type: Date,
      default: null,
    },
    minOrderAmount: {
      type: Number,
      default: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

couponSchema.pre('validate', function () {
  if (this.discountType === 'freeShipping') {
    this.discountValue = 0;
    return;
  }
  if (this.discountType === 'percentage' && this.discountValue > 100) {
    this.invalidate('discountValue', 'Percentage discount cannot exceed 100%');
  }
});

couponSchema.index({ expiresAt: 1 });

const Coupon = mongoose.model('Coupon', couponSchema);
export default Coupon;
