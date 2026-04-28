// src/models/Offer.js
import mongoose from 'mongoose';

const offerSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
      unique: true,
    },
    discountPercent: {
      type: Number,
      min: 0,
      max: 100,
      default: null,
    },
    discountAmount: {
      type: Number,
      min: 0,
      default: null,
    },
    productCount: {
      type: Number,
      min: 1,
      default: null,
    },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// بعد الـ save → حدّث الـ Product
offerSchema.post('save', async function () {
  const Product = mongoose.model('Product');
  const product = await Product.findById(this.product);
  if (!product) return;

  const discountAmount = this.discountPercent
    ? (product.price * this.discountPercent) / 100
    : this.discountAmount;

  await Product.findByIdAndUpdate(this.product, {
    priceAfterDiscount: Math.max(product.price - discountAmount, 0).toFixed(2),
    offerEndsAt: this.endDate,
  });
});

// لو الـ offer اتمسحت → شيل الـ priceAfterDiscount من الـ Product
offerSchema.post('findOneAndDelete', async function (doc) {
  if (!doc) return;
  const Product = mongoose.model('Product');
  await Product.findByIdAndUpdate(doc.product, {
    $set: { priceAfterDiscount: null, offerEndsAt: null },
  });
});

const Offer = mongoose.model('Offer', offerSchema);
export default Offer;
