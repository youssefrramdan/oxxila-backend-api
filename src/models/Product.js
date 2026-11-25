// src/models/Product.js
import mongoose from 'mongoose';
import {
  syncBilingualNameOnSave,
  syncBilingualNameOnUpdate,
} from '../utils/bilingualName.js';

const productSchema = new mongoose.Schema(
  {
    nameEn: {
      type: String,
      required: [true, 'English product name is required'],
      trim: true,
      minlength: [2, 'English name must be at least 2 characters'],
      maxlength: [200, 'English name must be at most 200 characters'],
    },
    nameAr: {
      type: String,
      // Optional: storefront falls back to nameEn when Arabic is missing.
      trim: true,
      maxlength: [200, 'Arabic name must be at most 200 characters'],
      default: '',
    },
    name: {
      type: String,
      trim: true,
      maxlength: [200, 'Name must be at most 200 characters'],
    },
    slug: { type: String, unique: true, lowercase: true, index: true },
    images: [{ type: String }],
    price: { type: Number, required: [true, 'Price is required'], min: 0 },
    priceAfterDiscount: { type: Number, min: 0, default: null },
    offerEndsAt: { type: Date, default: null },
    description: { type: String, maxlength: 2000 },
    advantages: { type: String, maxlength: 2000 },
    composition: { type: String, maxlength: 2000 },
    // Arabic counterparts. The fields above are the English copy (kept for existing data);
    // the storefront shows the Arabic text in Arabic and falls back to English when empty.
    descriptionAr: { type: String, maxlength: 2000, trim: true, default: '' },
    advantagesAr: { type: String, maxlength: 2000, trim: true, default: '' },
    compositionAr: { type: String, maxlength: 2000, trim: true, default: '' },
    stock: { type: Number, required: true, min: 0, default: 0 },
    // sold count
    soldCount: { type: Number, default: 0 },
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
    isBestSeller: { type: Boolean, default: false },
    isBundle: { type: Boolean, default: false },
    catalog: { type: String, default: null },
    certificationImage: { type: String, default: null },
    isCertified: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    views: { type: Number, default: 0 },
    ratingsAverage: { type: Number, min: 0, max: 5, default: null },
    ratingsQuantity: { type: Number, min: 0, default: 0 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
  
);

productSchema.pre('validate', function () {
  // pre-validate (not pre-save) so legacy docs with only `name` pass `nameEn` required.
  syncBilingualNameOnSave(this);
  if (this.isModified('certificationImage')) {
    this.isCertified = !!this.certificationImage;
  }
});

productSchema.pre('findOneAndUpdate', function () {
  const update = this.getUpdate() || {};
  syncBilingualNameOnUpdate(update);
  this.setUpdate(update);
});

productSchema.index({ category: 1, isActive: 1 });
productSchema.index({ nameAr: 1 });
productSchema.index({ nameEn: 1 });
productSchema.index({ subCategory: 1, isActive: 1 });
productSchema.index({ concerns: 1 });
productSchema.index({ isSensitiveSkin: 1 });
productSchema.index({ price: 1 });
productSchema.index({ views: -1 });
productSchema.index({ offerEndsAt: 1 });
productSchema.index({ priceAfterDiscount: 1 });

const Product = mongoose.model('Product', productSchema);
export default Product;
