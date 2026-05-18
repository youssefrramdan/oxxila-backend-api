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

const orderSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    items: {
      type: [orderItemSchema],
      validate: {
        validator: (v) => Array.isArray(v) && v.length > 0,
        message: 'Order must contain at least one item',
      },
    },
    shippingAddress: { type: shippingAddressSchema, required: true },
    subtotal: { type: Number, required: true, min: 0 },
    shippingPrice: { type: Number, required: true, min: 0 },
    discountAmount: { type: Number, default: 0, min: 0 },
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
    orderStatus: {
      type: String,
      enum: [
        'pending',
        'processing',
        'shipped',
        'delivered',
        'partially_returned',
        'returned',
        'cancelled',
      ],
      default: 'pending',
    },
    deliveredAt: { type: Date, default: null, index: true },
    bostaDeliveryId: { type: String, default: null },
    bostaTrackingNumber: { type: String, default: null },
    bostaStatus: { type: String, default: null },
  },
  { timestamps: true }
);

orderSchema.index({ user: 1, createdAt: -1 });
orderSchema.index({ paymentStatus: 1 });
orderSchema.index({ orderStatus: 1 });
orderSchema.index({ user: 1, orderStatus: 1, deliveredAt: -1 });

const Order = mongoose.model('Order', orderSchema);
export default Order;
