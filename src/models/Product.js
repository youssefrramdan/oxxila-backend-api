// src/models/Product.js
import mongoose from 'mongoose';
import slugify from 'slugify';

const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Product name is required'],
      trim: true,
      minlength: [2, 'Name must be at least 2 characters'],
      maxlength: [200, 'Name must be at most 200 characters'],
    },
    slug: { type: String, unique: true, lowercase: true, index: true },
    images: [{ type: String }],
    price: { type: Number, required: [true, 'Price is required'], min: 0 },
    priceAfterDiscount: {
      type: Number,
      min: 0,
      validate: {
        validator: function (val) {
          if (val == null || val === '') return true;
          return val < this.price;
        },
        message: 'priceAfterDiscount must be less than price',
      },
    },
    offerEndsAt: { type: Date, default: null },
    description: { type: String, maxlength: 2000 },
    advantages: { type: String, maxlength: 2000 },
    composition: { type: String, maxlength: 2000 },
    stock: { type: Number, required: true, min: 0, default: 0 },
    category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
    subCategory: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'SubCategory' }],
      validate: {
        validator(value) {
          return Array.isArray(value) && value.length >= 1;
        },
        message: 'At least one subcategory is required',
      },
    },
    brand: { type: mongoose.Schema.Types.ObjectId, ref: 'Brand', default: null },
    concerns: [
      {
        type: String,
        enum: ['acne', 'pigmentation', 'sensitive-skin', 'drought', 'wrinkles', 'wide-pores'],
      },
    ],
    isSensitiveSkin: { type: Boolean, default: false },
    catalog: { type: String, default: null },
    certificationImage: { type: String, default: null },
    isCertified: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    views: { type: Number, default: 0 },
    ratingsAverage: { type: Number, default: 0, min: 0, max: 5 },
    ratingsQuantity: { type: Number, default: 0 },
  },
  { timestamps: true }
);

productSchema.pre('save', function () {
  if (this.isModified('name')) {
    this.slug = slugify(this.name, { lower: true, strict: true });
  }
  if (this.isModified('certificationImage')) {
    this.isCertified = !!this.certificationImage;
  }
});

productSchema.index({ category: 1, isActive: 1 });
productSchema.index({ subCategory: 1, isActive: 1 });
productSchema.index({ concerns: 1 });
productSchema.index({ isSensitiveSkin: 1 });
productSchema.index({ price: 1 });
productSchema.index({ views: -1 });

const Product = mongoose.model('Product', productSchema);
export default Product;
