// src/utils/orderStockHelpers.js
import Product from '../models/Product.js';
import ApiError from './apiError.js';

export const decrementStockForOrderItems = async (orderItems, session) => {
  for (const item of orderItems) {
    const updated = await Product.findOneAndUpdate(
      { _id: item.product, stock: { $gte: item.quantity }, isActive: true },
      { $inc: { stock: -item.quantity, soldCount: item.quantity } },
      { new: true, session }
    );

    if (!updated) {
      throw new ApiError(`Not enough stock for "${item.name}"`, 400);
    }
  }
};

export const restoreStockForOrderItems = async (orderItems, session) => {
  for (const item of orderItems) {
    await Product.findByIdAndUpdate(
      item.product,
      { $inc: { stock: item.quantity, soldCount: -item.quantity } },
      { session }
    );
  }
};
