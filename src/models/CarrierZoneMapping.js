// src/models/CarrierZoneMapping.js
import mongoose from 'mongoose';

const carrierZoneMappingSchema = new mongoose.Schema(
  {
    carrier: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Carrier',
      required: [true, 'Carrier is required'],
    },
    zoneType: {
      type: String,
      enum: ['governorate', 'district'],
      required: true,
    },
    zoneId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    isServiceable: { type: Boolean, default: true },
    externalCityId: { type: String, default: null },
    externalDistrictId: { type: String, default: null },
    externalZoneId: { type: String, default: null },
    dropOffAvailable: { type: Boolean, default: true },
    metadata: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { timestamps: true }
);

carrierZoneMappingSchema.index({ carrier: 1, zoneType: 1, zoneId: 1 }, { unique: true });
carrierZoneMappingSchema.index({ carrier: 1, isServiceable: 1 });

const CarrierZoneMapping = mongoose.model('CarrierZoneMapping', carrierZoneMappingSchema);
export default CarrierZoneMapping;
