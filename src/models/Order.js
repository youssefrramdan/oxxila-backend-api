// src/models/Order.js
import mongoose from 'mongoose';

const orderItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    name: { type: String, required: true, trim: true },
    image: { type: String, default: null },
    price: { type: Number, required: true, min: 0 },
    quantity: { type: Number, required: true, min: 1 },
  },
);

const shippingSelectionSchema = new mongoose.Schema(
  {
    methodName: { type: String, default: 'Standard delivery' },
    price: { type: Number, min: 0, default: 0 },
    quotedAt: { type: Date, default: null },
  },
  { _id: false }
);

const shippingAddressSchema = new mongoose.Schema(
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

const fulfillmentSchema = new mongoose.Schema(
  {
    attempts: { type: Number, default: 0, min: 0 },
    exceptionReason: { type: String, default: null },
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    // Free-text customer label for admin/B2B orders that are not tied to a registered User
    customerName: { type: String, trim: true, default: null, maxlength: 100 },
    items: {
      type: [orderItemSchema],
      validate: {
        validator: (v) => Array.isArray(v) && v.length > 0,
        message: 'Order must contain at least one item',
      },
    },
    shippingAddress: { type: shippingAddressSchema, required: true },
    shipping: { type: shippingSelectionSchema, default: () => ({}) },
    fulfillment: { type: fulfillmentSchema, default: () => ({ attempts: 0 }) },
    subtotal: { type: Number, required: true, min: 0 },
    shippingPrice: { type: Number, required: true, min: 0 },
    discountAmount: { type: Number, default: 0, min: 0 },
    storeCreditApplied: { type: Number, default: 0, min: 0 },
    totalPrice: { type: Number, required: true, min: 0 },
    couponCode: { type: String, default: null },
    couponId: { type: mongoose.Schema.Types.ObjectId, ref: 'Coupon', default: null },
    paymentMethod: { type: String, enum: ['cod', 'card'], required: true },
    paymentProvider: { type: String, enum: ['stripe', 'paymob'], default: null },
    paymentReference: { type: String, default: null },
    paymentStatus: {
      type: String,
      enum: ['pending', 'paid', 'refunded'],
      default: 'pending',
    },
    codCollectedAt: { type: Date, default: null },
    orderStatus: {
      type: String,
      enum: [
        'pending',
        'confirmed',
        'processing',
        'shipped',
        'out_for_delivery',
        'failed_attempt',
        'returned',
        'partially_returned',
        'delivered',
        'cancelled',
      ],
      default: 'pending',
    },
    deliveredAt: { type: Date, default: null, index: true },
    cancelledAt: { type: Date, default: null },
    cancellationReason: { type: String, default: null },
    cancelledBy: { type: String, enum: ['user', 'admin'], default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    statusUpdatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

orderSchema.index({ user: 1, createdAt: -1 });
orderSchema.index({ paymentStatus: 1 });
orderSchema.index({ orderStatus: 1 });
orderSchema.index({ user: 1, orderStatus: 1, deliveredAt: -1 });

const Order = mongoose.model('Order', orderSchema);
export default Order;
