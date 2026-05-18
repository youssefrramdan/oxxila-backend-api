// src/models/ReturnRequest.js
import mongoose from 'mongoose';

const returnItemSchema = new mongoose.Schema(
  {
    orderItemId: { type: mongoose.Schema.Types.ObjectId, required: true },
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    name: { type: String, required: true, trim: true },
    price: { type: Number, required: true, min: 0 },
    quantity: { type: Number, required: true, min: 1 },
  },
  { _id: false }
);

const pickupAddressSchema = new mongoose.Schema(
  {
    city: { type: String, required: true, trim: true, maxlength: 100 },
    governorate: { type: String, required: true, trim: true, maxlength: 100 },
    address: { type: String, required: true, trim: true, maxlength: 500 },
  },
  { _id: false }
);

const returnRequestSchema = new mongoose.Schema(
  {
    order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    items: {
      type: [returnItemSchema],
      validate: {
        validator: (v) => Array.isArray(v) && v.length > 0,
        message: 'Return request must include at least one item',
      },
    },
    reason: {
      type: String,
      enum: [
        'damaged_item',
        'wrong_product',
        'allergic_reaction',
        'expired_product',
        'changed_mind',
        'other',
      ],
      required: true,
    },
    note: { type: String, trim: true, maxlength: 2000, default: '' },
    proofImages: { type: [String], default: [] },
    pickupAddress: { type: pickupAddressSchema, required: true },
    returnMethod: { type: String, enum: ['pickup', 'self_ship'], required: true },
    refundStatus: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'picked_up', 'received', 'refunded'],
      default: 'pending',
    },
    refundAmount: { type: Number, required: true, min: 0 },
    adminNote: { type: String, trim: true, maxlength: 1000, default: '' },
    gatewayRefundId: { type: String, default: null },
    manualRefundNote: { type: String, trim: true, maxlength: 500, default: '' },
    restocked: { type: Boolean, default: false },
    refundedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

returnRequestSchema.index({ user: 1, createdAt: -1 });
returnRequestSchema.index({ refundStatus: 1, createdAt: -1 });

const ReturnRequest = mongoose.model('ReturnRequest', returnRequestSchema);
export default ReturnRequest;
