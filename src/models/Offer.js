// src/models/Offer.js
import mongoose from 'mongoose';

const offerSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: [true, 'Product is required'],
    },
    // Exactly one of discountPercent / discountAmount must be set (percent vs fixed).
    discountPercent: {
      type: Number,
      min: [0, 'discountPercent must be >= 0'],
      max: [100, 'discountPercent must be <= 100'],
      default: null,
    },
    discountAmount: {
      type: Number,
      min: [0, 'discountAmount must be >= 0'],
      default: null,
    },
    productCount: {
      type: Number,
      min: [1, 'productCount must be >= 1'],
      default: null,
    },
    startDate: {
      type: Date,
      required: [true, 'startDate is required'],
    },
    endDate: {
      type: Date,
      required: [true, 'endDate is required'],
    },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

offerSchema.pre('validate', function () {
  const hasPercent = this.discountPercent != null;
  const hasAmount = this.discountAmount != null;

  if (!hasPercent && !hasAmount) {
    this.invalidate('discountPercent', 'Either discountPercent or discountAmount is required');
  }
  if (hasPercent && hasAmount) {
    this.invalidate('discountAmount', 'Provide either discountPercent or discountAmount, not both');
  }

  if (this.startDate && this.endDate && this.endDate <= this.startDate) {
    this.invalidate('endDate', 'endDate must be after startDate');
  }
});

offerSchema.index({ product: 1 });
offerSchema.index({ isActive: 1, startDate: 1, endDate: 1 });

const Offer = mongoose.model('Offer', offerSchema);
export default Offer;
