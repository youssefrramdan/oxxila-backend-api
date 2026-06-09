// src/models/Shipment.js
import mongoose from 'mongoose';

const shipmentEventSchema = new mongoose.Schema(
  {
    at: { type: Date, default: Date.now },
    code: { type: String, default: null },
    label: { type: String, default: null },
    source: { type: String, enum: ['webhook', 'admin', 'system', 'api'], default: 'system' },
  },
  { _id: false }
);

const methodSnapshotSchema = new mongoose.Schema(
  {
    methodName: { type: String, default: 'Standard delivery' },
    price: { type: Number, min: 0, default: 0 },
  },
  { _id: false }
);

const shipmentSchema = new mongoose.Schema(
  {
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      required: true,
      unique: true,
      index: true,
    },
    carrier: { type: mongoose.Schema.Types.ObjectId, ref: 'Carrier', default: null },
    carrierName: { type: String, default: null },
    carrierCode: { type: String, default: null },
    carrierType: { type: String, enum: ['api', 'known', 'internal'], default: null },
    status: {
      type: String,
      enum: [
        'pending_assignment',
        'submitted',
        'picked_up',
        'in_transit',
        'out_for_delivery',
        'delivered',
        'failed',
        'cancelled',
      ],
      default: 'pending_assignment',
    },
    methodSnapshot: { type: methodSnapshotSchema, default: () => ({}) },
    trackingNumber: { type: String, default: null, index: true },
    externalDeliveryId: { type: String, default: null, index: true },
    providerState: { type: String, default: null },
    providerStateLabel: { type: String, default: null },
    driverName: { type: String, default: null },
    driverPhone: { type: String, default: null },
    notes: { type: String, default: null },
    assignedAt: { type: Date, default: null },
    assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    lastError: { type: String, default: null },
    attemptCount: { type: Number, default: 0, min: 0 },
    events: { type: [shipmentEventSchema], default: [] },
  },
  { timestamps: true }
);

const Shipment = mongoose.model('Shipment', shipmentSchema);
export default Shipment;
