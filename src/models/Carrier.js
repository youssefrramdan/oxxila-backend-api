// src/models/Carrier.js
import mongoose from 'mongoose';

const carrierSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Carrier name is required'],
      trim: true,
    },
    code: {
      type: String,
      required: [true, 'Carrier code is required'],
      uppercase: true,
      trim: true,
    },
    type: {
      type: String,
      enum: ['api', 'known', 'internal'],
      required: [true, 'Carrier type is required'],
    },
    logo: {
      type: String,
      default: '',
    },
    deliveryDays: {
      type: String,
      default: null,
    },
    apiProvider: {
      type: String,
      enum: ['bosta', 'mylerz'],
      default: null,
    },
    apiKey: {
      type: String,
      select: false,
      default: null,
    },
    apiBaseUrl: {
      type: String,
      select: false,
      default: null,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

carrierSchema.index({ code: 1 }, { unique: true });
carrierSchema.index({ type: 1, isActive: 1 });

const Carrier = mongoose.model('Carrier', carrierSchema);
export default Carrier;
