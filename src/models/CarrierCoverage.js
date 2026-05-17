// src/models/CarrierCoverage.js
import mongoose from 'mongoose';

const carrierCoverageSchema = new mongoose.Schema(
  {
    carrier: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Carrier',
      required: [true, 'Carrier is required'],
    },
    governorate: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Governorate',
      required: [true, 'Governorate is required'],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

carrierCoverageSchema.index({ carrier: 1, governorate: 1 }, { unique: true });

const CarrierCoverage = mongoose.model('CarrierCoverage', carrierCoverageSchema);
export default CarrierCoverage;
