// src/utils/orderRefundHelpers.js
import mongoose from 'mongoose';
import Order from '../models/Order.js';
import ApiError from './apiError.js';
import { createStripeRefund, resolveStripePaymentIntentId } from './stripeClient.js';
import { restoreStockForOrderItems } from './orderStockHelpers.js';

const markOrderRefundedInDb = async (orderId) => {
  const session = await mongoose.startSession();
  let updated;

  try {
    await session.withTransaction(async () => {
      const order = await Order.findOneAndUpdate(
        { _id: orderId, paymentStatus: 'paid' },
        { paymentStatus: 'refunded', orderStatus: 'cancelled' },
        { new: true, session }
      );

      if (!order) {
        const existing = await Order.findById(orderId).session(session);
        if (existing?.paymentStatus === 'refunded') {
          updated = existing;
          return;
        }
        throw new ApiError('Order is not in a refundable state', 409);
      }

      await restoreStockForOrderItems(order.items, session);
      updated = order;
    });
  } finally {
    session.endSession();
  }

  return updated;
};

export const assertOrderRefundableViaStripe = (order) => {
  if (order.paymentStatus === 'refunded') {
    return { alreadyRefunded: true };
  }
  if (order.paymentMethod !== 'card' || order.paymentProvider !== 'stripe') {
    throw new ApiError('Only paid Stripe card orders can be refunded through this endpoint', 400);
  }
  if (order.paymentStatus !== 'paid') {
    throw new ApiError('Order is not in a refundable state', 400);
  }
  if (!order.paymentReference) {
    throw new ApiError('Order has no payment reference for refund', 400);
  }
  return { alreadyRefunded: false };
};

export const processStripeOrderRefund = async (order) => {
  const check = assertOrderRefundableViaStripe(order);
  if (check.alreadyRefunded) {
    return { order, refund: null, alreadyRefunded: true };
  }

  const paymentIntentId = await resolveStripePaymentIntentId(order.paymentReference);
  const refund = await createStripeRefund({ paymentIntentId });
  const updated = await markOrderRefundedInDb(order._id);

  return { order: updated, refund, alreadyRefunded: false };
};

export const syncOrderRefundedFromStripe = async (paymentIntentId) => {
  if (!paymentIntentId) return null;

  const order = await Order.findOne({
    paymentProvider: 'stripe',
    paymentMethod: 'card',
    paymentStatus: 'paid',
    paymentReference: paymentIntentId,
  });

  if (!order) return null;

  return markOrderRefundedInDb(order._id);
};
