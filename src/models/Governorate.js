// src/models/Governorate.js
import mongoose from 'mongoose';

const governorateSchema = new mongoose.Schema(
  {
    country: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Country',
      required: [true, 'Country is required'],
    },
    name: {
      type: String,
      required: [true, 'Governorate name is required'],
      trim: true,
    },
    shippingPrice: {
      type: Number,
      required: [true, 'Shipping price is required'],
      min: [0, 'Shipping price cannot be negative'],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

governorateSchema.index({ country: 1, isActive: 1 });

const Governorate = mongoose.model('Governorate', governorateSchema);
export default Governorate;
