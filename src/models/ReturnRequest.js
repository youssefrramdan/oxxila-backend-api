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

const proofImageSchema = new mongoose.Schema(
  {
    url: { type: String, required: true },
    publicId: { type: String, default: null },
  },
  { _id: false }
);

const pickupAddressSchema = new mongoose.Schema(
  {
    firstLine: { type: String, required: true, trim: true },
    secondLine: { type: String, trim: true, default: '' },
    city: { type: String, required: true, trim: true },
    governorateName: { type: String, required: true, trim: true },
    governorateId: { type: mongoose.Schema.Types.ObjectId, ref: 'Governorate', default: null },
    districtId: { type: mongoose.Schema.Types.ObjectId, ref: 'District', default: null },
    districtName: { type: String, trim: true, default: null },
    cityId: { type: String, trim: true, default: null },
    zoneId: { type: String, trim: true, default: null },
    bostaDistrictId: { type: String, trim: true, default: null },
  },
  { _id: false }
);

const dropOffSnapshotSchema = new mongoose.Schema(
  {
    locationName: { type: String, trim: true },
    bostaLocationId: { type: String, default: null },
    address: { type: mongoose.Schema.Types.Mixed, default: null },
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
        message: 'Return must include at least one item',
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
    note: { type: String, trim: true, default: '', maxlength: 1000 },
    proofImages: { type: [proofImageSchema], default: [] },
    pickupAddress: { type: pickupAddressSchema, required: true },
    contactPhone: { type: String, trim: true, default: null },
    logisticsHandler: {
      type: String,
      enum: ['bosta', 'internal'],
      default: null,
    },
    carrier: { type: mongoose.Schema.Types.ObjectId, ref: 'Carrier', default: null },
    dropOffPickup: { type: mongoose.Schema.Types.ObjectId, ref: 'CarrierPickup', default: null },
    dropOffSnapshot: { type: dropOffSnapshotSchema, default: null },
    refundStatus: {
      type: String,
      enum: ['pending', 'approved', 'picked_up', 'received', 'refunded', 'rejected'],
      default: 'pending',
      index: true,
    },
    refundAmount: { type: Number, required: true, min: 0 },
    gatewayRefundId: { type: String, default: null },
    adminNote: { type: String, trim: true, default: null },
    restocked: { type: Boolean, default: false },
    refundedAt: { type: Date, default: null },
    bostaExternalId: { type: String, default: null },
    bostaTrackingNumber: { type: String, default: null },
    bostaState: { type: String, default: null },
    bostaStateLabel: { type: String, default: null },
    logisticsScheduledAt: { type: Date, default: null },
    logisticsNotes: { type: String, trim: true, default: null },
  },
  { timestamps: true }
);

returnRequestSchema.index({ user: 1, createdAt: -1 });
returnRequestSchema.index({ order: 1, refundStatus: 1 });
returnRequestSchema.index({ refundStatus: 1, createdAt: -1 });

const ReturnRequest = mongoose.model('ReturnRequest', returnRequestSchema);
export default ReturnRequest;
