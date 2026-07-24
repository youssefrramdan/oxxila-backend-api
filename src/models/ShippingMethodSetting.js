// src/models/ShippingMethodSetting.js
import mongoose from 'mongoose';

export const SHIPPING_METHOD_TYPES = ['api', 'known', 'internal'];

const METHOD_DEFAULTS = [
  { type: 'api', name: 'API Carrier', isEnabled: true },
  { type: 'known', name: 'Known Carrier', isEnabled: true },
  { type: 'internal', name: 'Internal Delivery', isEnabled: true },
];

const shippingMethodSettingSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: SHIPPING_METHOD_TYPES,
      required: true,
      unique: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    isEnabled: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

/** Ensure default method toggles exist (idempotent). */
shippingMethodSettingSchema.statics.ensureDefaults = async function ensureDefaults() {
  await Promise.all(
    METHOD_DEFAULTS.map((row) =>
      this.updateOne({ type: row.type }, { $setOnInsert: row }, { upsert: true })
    )
  );
};

/** True when this carrier type is globally enabled. */
shippingMethodSettingSchema.statics.isTypeEnabled = async function isTypeEnabled(type) {
  await this.ensureDefaults();
  const row = await this.findOne({ type }).lean();
  return Boolean(row?.isEnabled);
};

/** Set of currently enabled carrier types. */
shippingMethodSettingSchema.statics.getEnabledTypes = async function getEnabledTypes() {
  await this.ensureDefaults();
  const rows = await this.find({ isEnabled: true }).select('type').lean();
  return new Set(rows.map((r) => r.type));
};

const ShippingMethodSetting = mongoose.model('ShippingMethodSetting', shippingMethodSettingSchema);
export default ShippingMethodSetting;
