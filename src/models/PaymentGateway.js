// src/models/PaymentGateway.js
import mongoose from 'mongoose';

export const GATEWAY_CODES = ['stripe', 'paymob', 'cod'];

const paymentGatewaySchema = new mongoose.Schema(
  {
    code: {
      type: String,
      enum: GATEWAY_CODES,
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

/** Ensure default gateways exist (idempotent). */
paymentGatewaySchema.statics.ensureDefaults = async function ensureDefaults() {
  const defaults = [
    { code: 'stripe', name: 'Stripe', isEnabled: true },
    { code: 'paymob', name: 'Paymob', isEnabled: true },
    { code: 'cod', name: 'Cash on Delivery', isEnabled: true },
  ];

  await Promise.all(
    defaults.map((gw) =>
      this.updateOne({ code: gw.code }, { $setOnInsert: gw }, { upsert: true })
    )
  );
};

/** True when gateway exists and isEnabled. */
paymentGatewaySchema.statics.isGatewayEnabled = async function isGatewayEnabled(code) {
  await this.ensureDefaults();
  const gw = await this.findOne({ code }).lean();
  return Boolean(gw?.isEnabled);
};

const PaymentGateway = mongoose.model('PaymentGateway', paymentGatewaySchema);
export default PaymentGateway;
