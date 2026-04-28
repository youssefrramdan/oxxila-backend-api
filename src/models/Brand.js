// src/models/Brand.js
import mongoose from 'mongoose';
import slugify from 'slugify';

const brandSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      unique: true,
      required: [true, 'Brand name is required'],
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

    logo: {
      type: String,
      default: null,
    },

    description: {
      type: String,
      maxlength: [500, 'Description must be at most 500 characters'],
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

brandSchema.pre('save', function () {
  if (this.isModified('name')) {
    this.slug = slugify(this.name, { lower: true, strict: true });
  }
});

brandSchema.index({ isActive: 1 });

const Brand = mongoose.model('Brand', brandSchema);
export default Brand;
