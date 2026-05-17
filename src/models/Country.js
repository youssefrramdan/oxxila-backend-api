// src/models/Country.js
import mongoose from 'mongoose';

const countrySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Country name is required'],
      trim: true,
    },
    code: {
      type: String,
      required: [true, 'Country code is required'],
      uppercase: true,
      trim: true,
    },
    currency: {
      type: String,
      required: [true, 'Currency code is required'],
      uppercase: true,
      trim: true,
      minlength: [3, 'Currency must be a 3-letter ISO code'],
      maxlength: [3, 'Currency must be a 3-letter ISO code'],
    },
    flag: {
      type: String,
      default: '',
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

countrySchema.index({ code: 1 }, { unique: true });
countrySchema.index({ isActive: 1 });

const Country = mongoose.model('Country', countrySchema);
export default Country;
