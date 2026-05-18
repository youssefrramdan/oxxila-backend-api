// src/utils/payment/session.js
import PaymentSession from '../../models/PaymentSession.js';
import Order from '../../models/Order.js';
import ApiError from '../apiError.js';
import { fulfillCheckout, toMinorUnits } from '../checkoutHelpers.js';
import { ACTIVE_PAYMENT_SESSION_STATUSES } from './constants.js';

export const saveProviderSessionId = async (paymentSession, providerSessionId) => {
  paymentSession.providerSessionId = providerSessionId;
  await paymentSession.save();
};

export const markPaymentSessionFailed = async (paymentSessionId) => {
  if (!paymentSessionId) return;
  await PaymentSession.updateOne(
    { _id: paymentSessionId, status: { $in: ACTIVE_PAYMENT_SESSION_STATUSES } },
    { status: 'failed' }
  );
};

export const assertPaymentSessionForFulfillment = async (
  paymentSessionId,
  { provider, amountCents }
) => {
  const session = await PaymentSession.findById(paymentSessionId);
  if (!session) {
    throw new ApiError(`No payment session found with id: ${paymentSessionId}`, 404);
  }
  if (session.provider !== provider) {
    throw new ApiError('Payment session provider mismatch', 400);
  }
  if (amountCents != null) {
    const expected = toMinorUnits(session.totalPrice);
    if (!Number.isFinite(amountCents) || amountCents !== expected) {
      throw new ApiError('Payment amount does not match session total', 400);
    }
  }
  return session;
};

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
    { _id: paymentSessionId, status: { $in: ACTIVE_PAYMENT_SESSION_STATUSES } },
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
