// src/utils/returnRefundHelpers.js
import mongoose from 'mongoose';
import ReturnRequest from '../models/ReturnRequest.js';
import ApiError from './apiError.js';
import { toMinorUnits } from './checkoutHelpers.js';
import { createPaymobRefund } from './payment/paymob.js';
import { createStripeRefund, resolveStripePaymentIntentId } from './payment/stripe.js';
import { restoreStockForOrderItems } from './orderStockHelpers.js';
import { syncOrderReturnState } from './returnHelpers.js';
import { issueStoreCredit } from './storeCredit.js';

const CARD_PROVIDERS = ['stripe', 'paymob'];

export const finalizeReturnRefund = async (returnRequest, order) => {
  if (returnRequest.restocked) {
    return {
      returnRequest,
      gatewayRefundId: returnRequest.gatewayRefundId,
      alreadyDone: true,
      storeCreditIssued: false,
    };
  }

  const alreadyRefunded = await ReturnRequest.aggregate([
    {
      $match: {
        order: order._id,
        refundStatus: 'refunded',
        _id: { $ne: returnRequest._id },
      },
    },
    { $group: { _id: null, total: { $sum: '$refundAmount' } } },
  ]);
  const priorTotal = alreadyRefunded[0]?.total ?? 0;
  const cap = Math.max(0, order.totalPrice - priorTotal);

  if (returnRequest.refundAmount > cap + 0.01) {
    throw new ApiError(
      `Refund amount exceeds remaining refundable balance (${cap} EGP)`,
      400
    );
  }

  let gatewayRefundId = returnRequest.gatewayRefundId;

  if (
    order.paymentMethod === 'card' &&
    order.paymentStatus === 'paid' &&
    CARD_PROVIDERS.includes(order.paymentProvider)
  ) {
    if (!order.paymentReference) {
      throw new ApiError('Order has no payment reference for refund', 400);
    }

    const amountCents = toMinorUnits(returnRequest.refundAmount);

    if (order.paymentProvider === 'stripe') {
      const paymentIntentId = await resolveStripePaymentIntentId(order.paymentReference);
      const refund = await createStripeRefund({
        paymentIntentId,
        amount: amountCents,
      });
      gatewayRefundId = refund.id;
    } else if (order.paymentProvider === 'paymob') {
      const refund = await createPaymobRefund({
        transactionId: order.paymentReference,
        amountCents,
      });
      gatewayRefundId = String(refund.id ?? refund.transaction_id ?? '');
    } else {
      throw new ApiError('Unsupported payment provider for return refund', 400);
    }
  }

  const session = await mongoose.startSession();
  let updated;
  let storeCreditIssued = false;

  try {
    await session.withTransaction(async () => {
      if (order.paymentMethod === 'cod') {
        const creditResult = await issueStoreCredit({
          userId: returnRequest.user,
          amount: returnRequest.refundAmount,
          returnRequestId: returnRequest._id,
          session,
        });
        storeCreditIssued = !creditResult.alreadyIssued;
      }

      await restoreStockForOrderItems(returnRequest.items, session);

      updated = await ReturnRequest.findByIdAndUpdate(
        returnRequest._id,
        {
          refundStatus: 'refunded',
          restocked: true,
          refundedAt: new Date(),
          gatewayRefundId: gatewayRefundId ?? null,
        },
        { new: true, session, runValidators: true }
      );

      await syncOrderReturnState(order._id, session);
    });
  } finally {
    session.endSession();
  }

  return {
    returnRequest: updated,
    gatewayRefundId,
    alreadyDone: false,
    storeCreditIssued,
  };
};
