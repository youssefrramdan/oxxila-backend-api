// src/models/Review.js
import mongoose from 'mongoose';
import Product from './Product.js';

const reviewSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      trim: true,
      maxlength: [100, 'Title cannot exceed 100 characters'],
    },
    comment: {
      type: String,
      required: [true, 'Comment is required'],
      trim: true,
      maxlength: [1000, 'Comment cannot exceed 1000 characters'],
    },
    rating: {
      type: Number,
      required: [true, 'Rating is required'],
      min: [1, 'Rating must be at least 1'],
      max: [5, 'Rating must be at most 5'],
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
    },
    likes: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    likesCount: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  { timestamps: true }
);

reviewSchema.index({ user: 1, product: 1 }, { unique: true });
reviewSchema.index({ product: 1 });

reviewSchema.statics.calcAverageRatings = async function (productId) {
  const pid =
    productId instanceof mongoose.Types.ObjectId
      ? productId
      : new mongoose.Types.ObjectId(String(productId));

  const stats = await this.aggregate([
    { $match: { product: pid } },
    {
      $group: {
        _id: '$product',
        ratingsQuantity: { $sum: 1 },
        ratingsAverage: { $avg: '$rating' },
      },
    },
  ]);

  if (stats.length > 0) {
    await Product.findByIdAndUpdate(pid, {
      ratingsQuantity: stats[0].ratingsQuantity,
      ratingsAverage: Math.round(stats[0].ratingsAverage * 10) / 10,
    });
  } else {
    await Product.findByIdAndUpdate(pid, {
      ratingsQuantity: 0,
      ratingsAverage: 0,
    });
  }
};

reviewSchema.post('save', function () {
  return this.constructor.calcAverageRatings(this.product);
});

reviewSchema.post('findOneAndDelete', function (doc) {
  if (doc) return doc.constructor.calcAverageRatings(doc.product);
});

const Review = mongoose.model('Review', reviewSchema);
export default Review;
