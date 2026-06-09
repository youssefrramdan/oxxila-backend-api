// src/models/StoreCreditTransaction.js
import mongoose from 'mongoose';

const storeCreditTransactionSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, enum: ['issued', 'redeemed'], required: true },
    amount: { type: Number, required: true, min: 0.01 },
    returnRequest: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ReturnRequest',
      default: null,
    },
    order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null },
    balanceAfter: { type: Number, required: true, min: 0 },
  },
  { timestamps: true }
);

storeCreditTransactionSchema.index(
  { returnRequest: 1, type: 1 },
  { unique: true, partialFilterExpression: { returnRequest: { $type: 'objectId' }, type: 'issued' } }
);

export default mongoose.model('StoreCreditTransaction', storeCreditTransactionSchema);
