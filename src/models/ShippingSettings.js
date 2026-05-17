// src/models/ShippingSettings.js
import mongoose from 'mongoose';

const shippingSettingsSchema = new mongoose.Schema(
  {
    api: {
      type: Boolean,
      default: true,
    },
    known: {
      type: Boolean,
      default: true,
    },
    internal: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

const ShippingSettings = mongoose.model('ShippingSettings', shippingSettingsSchema);
export default ShippingSettings;
