// src/models/District.js
import mongoose from 'mongoose';

const districtSchema = new mongoose.Schema(
  {
    governorate: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Governorate',
      required: [true, 'Governorate is required'],
    },
    name: {
      type: String,
      required: [true, 'District name is required'],
      trim: true,
    },
    shippingPrice: {
      type: Number,
      required: [true, 'Shipping price is required'],
      min: [0, 'Shipping price cannot be negative'],
    },
    isCovered: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

districtSchema.index({ governorate: 1, isCovered: 1 });

const District = mongoose.model('District', districtSchema);
export default District;
