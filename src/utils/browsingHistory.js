// src/utils/browsingHistory.js
import mongoose from 'mongoose';
import User from '../models/User.js';

export async function addToBrowsingHistory(userId, productId, categoryId) {
  const pid =
    productId instanceof mongoose.Types.ObjectId
      ? productId
      : new mongoose.Types.ObjectId(String(productId));

  const updated = await User.findOneAndUpdate(
    { _id: userId, 'browsingHistory.product': pid },
    { $set: { 'browsingHistory.$.viewedAt': new Date() } }
  );

  if (!updated) {
    await User.findByIdAndUpdate(userId, {
      $push: {
        browsingHistory: {
          $each: [{ product: pid, category: categoryId, viewedAt: new Date() }],
          $position: 0,
          $slice: 20,
        },
      },
    });
  }
}
