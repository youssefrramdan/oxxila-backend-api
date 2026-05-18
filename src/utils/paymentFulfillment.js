// src/utils/paymentFulfillment.js
import PaymentSession from '../models/PaymentSession.js';
import Order from '../models/Order.js';
import ApiError from './apiError.js';
import { fulfillCheckout } from './checkoutHelpers.js';

export const fulfillPaymentSession = async (paymentSessionId, paymentReference) => {
  const existing = await PaymentSession.findById(paymentSessionId);
  if (!existing) {
    throw new ApiError(`No payment session found with id: ${paymentSessionId}`, 404);
  }

  if (existing.status === 'completed' && existing.order) {
    return Order.findById(existing.order);
  }

  if (existing.status === 'expired' || existing.expiresAt < new Date()) {
    if (existing.status !== 'expired') {
      await PaymentSession.updateOne({ _id: paymentSessionId }, { status: 'expired' });
    }
    throw new ApiError('Payment session has expired', 400);
  }

  const locked = await PaymentSession.findOneAndUpdate(
    { _id: paymentSessionId, status: { $in: ['pending', 'processing'] } },
    { status: 'processing' },
    { new: true }
  );

  if (!locked) {
    const again = await PaymentSession.findById(paymentSessionId);
    if (again?.status === 'completed' && again.order) {
      return Order.findById(again.order);
    }
    throw new ApiError('Payment session is not available for fulfillment', 409);
  }

  try {
    const order = await fulfillCheckout(locked, {
      method: 'card',
      status: 'paid',
      provider: locked.provider,
      reference: paymentReference,
    });

    await PaymentSession.updateOne(
      { _id: paymentSessionId },
      { status: 'completed', order: order._id }
    );

    return order;
  } catch (err) {
    await PaymentSession.updateOne(
      { _id: paymentSessionId, status: 'processing' },
      { status: 'pending' }
    );
    throw err;
  }
};
