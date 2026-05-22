// src/utils/orderStockHelpers.js
import Product from '../models/Product.js';
import ApiError from './apiError.js';

export const decrementStockForOrderItems = async (orderItems, session) => {
  if (!orderItems?.length) return;

  const result = await Product.bulkWrite(
    orderItems.map((item) => ({
      updateOne: {
        filter: { _id: item.product, stock: { $gte: item.quantity }, isActive: true },
        update: { $inc: { stock: -item.quantity, soldCount: item.quantity } },
      },
    })),
    { session, ordered: true }
  );

  if (result.modifiedCount === orderItems.length) return;

  for (const item of orderItems) {
    const product = await Product.findById(item.product).session(session).select('stock isActive name');
    if (!product?.isActive || product.stock < item.quantity) {
      throw new ApiError(`Not enough stock for "${item.name}"`, 400);
    }
  }

  throw new ApiError('Not enough stock for one or more items', 400);
};

export const restoreStockForOrderItems = async (orderItems, session) => {
  if (!orderItems?.length) return;

  await Product.bulkWrite(
    orderItems.map((item) => ({
      updateOne: {
        filter: { _id: item.product },
        update: { $inc: { stock: item.quantity, soldCount: -item.quantity } },
      },
    })),
    { session, ordered: true }
  );
};
