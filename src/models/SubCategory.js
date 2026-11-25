// src/models/SubCategory.js
import mongoose from 'mongoose';
import {
  syncBilingualNameOnSave,
  syncBilingualNameOnUpdate,
} from '../utils/bilingualName.js';

const subCategorySchema = new mongoose.Schema(
  {
    nameEn: {
      type: String,
      required: [true, 'English subcategory name is required'],
      trim: true,
      minlength: [2, 'English name must be at least 2 characters'],
      maxlength: [50, 'English name must be at most 50 characters'],
    },
    nameAr: {
      type: String,
      // Optional: storefront falls back to nameEn when Arabic is missing.
      trim: true,
      maxlength: [50, 'Arabic name must be at most 50 characters'],
      default: '',
    },
    name: {
      type: String,
      trim: true,
      maxlength: [50, 'Name must be at most 50 characters'],
    },
    slug: {
      type: String,
      unique: true,
      lowercase: true,
      index: true,
    },
    image: {
      type: String,
      default: null,
    },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      required: [true, 'SubCategory must belong to a Category'],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  {
    id: false,
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

subCategorySchema.pre('validate', function () {
  // pre-validate (not pre-save) so legacy docs with only `name` pass `nameEn` required.
  syncBilingualNameOnSave(this);
});

subCategorySchema.pre('findOneAndUpdate', function () {
  const update = this.getUpdate() || {};
  syncBilingualNameOnUpdate(update);
  this.setUpdate(update);
});

subCategorySchema.index({ nameEn: 1, category: 1 }, { unique: true });
subCategorySchema.index({ nameAr: 1 });

const SubCategory = mongoose.model('SubCategory', subCategorySchema);
export default SubCategory;
