// src/models/SubCategory.js
import mongoose from 'mongoose';
import slugify from 'slugify';

const subCategorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'SubCategory name is required'],
      trim: true,
      minlength: [2, 'Name must be at least 2 characters'],
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
  },
  {
    id: false,
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

subCategorySchema.pre('save', function () {
  if (this.isModified('name')) {
    this.slug = slugify(this.name, { lower: true, strict: true });
  }
});

subCategorySchema.index({ name: 1, category: 1 }, { unique: true });

const SubCategory = mongoose.model('SubCategory', subCategorySchema);
export default SubCategory;
