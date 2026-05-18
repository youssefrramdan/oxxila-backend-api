// src/models/PaymentSession.js
import mongoose from 'mongoose';

const paymentItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    name: { type: String, required: true, trim: true },
    image: { type: String, default: null },
    price: { type: Number, required: true, min: 0 },
    quantity: { type: Number, required: true, min: 1 },
  },
  { _id: false }
);

const paymentShippingAddressSchema = new mongoose.Schema(
  {
    countryName: { type: String, required: true, trim: true },
    governorateName: { type: String, required: true, trim: true },
    districtName: { type: String, required: true, trim: true },
    addressLine: { type: String, required: true, trim: true },
    isOther: { type: Boolean, default: false },
    countryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Country', required: true },
    governorateId: { type: mongoose.Schema.Types.ObjectId, ref: 'Governorate', required: true },
    districtId: { type: mongoose.Schema.Types.ObjectId, ref: 'District', default: null },
  },
  { _id: false }
);

const paymentSessionSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    items: {
      type: [paymentItemSchema],
      validate: {
        validator: (v) => Array.isArray(v) && v.length > 0,
        message: 'Payment session must contain at least one item',
      },
    },
    shippingAddress: { type: paymentShippingAddressSchema, required: true },
    subtotal: { type: Number, required: true, min: 0 },
    shippingPrice: { type: Number, required: true, min: 0 },
    discountAmount: { type: Number, default: 0, min: 0 },
    totalPrice: { type: Number, required: true, min: 0 },
    couponCode: { type: String, default: null },
    couponId: { type: mongoose.Schema.Types.ObjectId, ref: 'Coupon', default: null },
    provider: { type: String, enum: ['stripe', 'paymob'], required: true },
    providerSessionId: { type: String, required: true, index: true },
    status: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'failed', 'expired'],
      default: 'pending',
      index: true,
    },
    order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

paymentSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const PaymentSession = mongoose.model('PaymentSession', paymentSessionSchema);
export default PaymentSession;
