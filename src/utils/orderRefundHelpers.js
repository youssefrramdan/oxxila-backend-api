// src/utils/orderRefundHelpers.js
import mongoose from 'mongoose';
import Order from '../models/Order.js';
import ApiError from './apiError.js';
import { toMinorUnits } from './checkoutHelpers.js';
import { createPaymobRefund } from './payment/paymob.js';
import { createStripeRefund, resolveStripePaymentIntentId } from './payment/stripe.js';
import { restoreStockForOrderItems } from './orderStockHelpers.js';

const CARD_PROVIDERS = ['stripe', 'paymob'];

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

const assertOrderRefundable = (order) => {
  if (order.paymentStatus === 'refunded') {
    return { alreadyRefunded: true };
  }
  if (order.paymentMethod !== 'card' || !CARD_PROVIDERS.includes(order.paymentProvider)) {
    throw new ApiError('Only paid Stripe or Paymob card orders can be refunded through this endpoint', 400);
  }
  if (order.paymentStatus !== 'paid') {
    throw new ApiError('Order is not in a refundable state', 400);
  }
  if (!order.paymentReference) {
    throw new ApiError('Order has no payment reference for refund', 400);
  }
  return { alreadyRefunded: false };
};

/** Full gateway + DB refund for a paid card order (Stripe or Paymob). */
export const processCardOrderRefund = async (order) => {
  const check = assertOrderRefundable(order);
  if (check.alreadyRefunded) {
    return { order, gatewayRefundId: null, alreadyRefunded: true };
  }

  let gatewayRefundId;

  if (order.paymentProvider === 'stripe') {
    const paymentIntentId = await resolveStripePaymentIntentId(order.paymentReference);
    const refund = await createStripeRefund({ paymentIntentId });
    gatewayRefundId = refund.id;
  } else if (order.paymentProvider === 'paymob') {
    const refund = await createPaymobRefund({
      transactionId: order.paymentReference,
      amountCents: toMinorUnits(order.totalPrice),
    });
    gatewayRefundId = String(refund.id ?? refund.transaction_id ?? '');
  } else {
    throw new ApiError('Unsupported payment provider for refund', 400);
  }

  const updated = await markOrderRefundedInDb(order._id);
  return { order: updated, gatewayRefundId, alreadyRefunded: false };
};

/** @deprecated Use processCardOrderRefund */
export const processStripeOrderRefund = processCardOrderRefund;

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
