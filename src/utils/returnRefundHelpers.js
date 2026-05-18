// src/utils/returnRefundHelpers.js
import mongoose from 'mongoose';
import Order from '../models/Order.js';
import ReturnRequest from '../models/ReturnRequest.js';
import ApiError from './apiError.js';
import { restoreStockForOrderItems } from './orderStockHelpers.js';
import { createStripeRefund, resolveStripePaymentIntentId } from './stripeClient.js';
import { createPaymobRefund } from './paymobClient.js';
import { toMinorUnits } from './checkoutHelpers.js';

const toStockItems = (returnItems) =>
  returnItems.map((line) => ({
    product: line.product,
    name: line.name,
    quantity: line.quantity,
  }));

export const syncOrderReturnState = async (orderId, session) => {
  const order = await Order.findById(orderId).session(session);
  if (!order) return;

  const refundedReturns = await ReturnRequest.find({
    order: orderId,
    refundStatus: 'refunded',
  })
    .select('items refundAmount')
    .session(session);

  const returnedQtyByItem = new Map();
  let totalRefunded = 0;

  for (const req of refundedReturns) {
    totalRefunded += req.refundAmount;
    for (const line of req.items) {
      const key = String(line.orderItemId);
      returnedQtyByItem.set(key, (returnedQtyByItem.get(key) ?? 0) + line.quantity);
    }
  }

  const allFullyReturned = order.items.every((line) => {
    const returned = returnedQtyByItem.get(String(line._id)) ?? 0;
    return returned >= line.quantity;
  });

  const anyReturned = returnedQtyByItem.size > 0;

  let orderStatus = order.orderStatus;
  if (allFullyReturned && anyReturned) {
    orderStatus = 'returned';
  } else if (anyReturned) {
    orderStatus = 'partially_returned';
  }

  let paymentStatus = order.paymentStatus;
  if (
    order.paymentMethod === 'card' &&
    (allFullyReturned || totalRefunded >= order.totalPrice - 0.01)
  ) {
    paymentStatus = 'refunded';
  }

  await Order.updateOne(
    { _id: orderId },
    { orderStatus, paymentStatus },
    { session }
  );
};

/**
 * Gateway refund (card) + restock + mark return refunded. COD skips gateway.
 */
export const finalizeReturnRefund = async (returnRequest) => {
  if (returnRequest.refundStatus === 'refunded') {
    return returnRequest;
  }

  const order = await Order.findById(returnRequest.order);
  if (!order) {
    throw new ApiError(`No order found with id: ${returnRequest.order}`, 404);
  }

  const session = await mongoose.startSession();
  let gatewayRefundId = null;

  try {
    await session.withTransaction(async () => {
      const locked = await ReturnRequest.findOneAndUpdate(
        { _id: returnRequest._id, refundStatus: 'received' },
        { refundStatus: 'refunded', refundedAt: new Date() },
        { new: true, session }
      );

      if (!locked) {
        throw new ApiError('Return request is not ready for refund processing', 409);
      }

      if (order.paymentMethod === 'card') {
        if (!order.paymentReference) {
          throw new ApiError('Order has no payment reference for gateway refund', 400);
        }

        const amountCents = toMinorUnits(locked.refundAmount);

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
          throw new ApiError('Unsupported payment provider for automatic refund', 400);
        }
      }

      if (!locked.restocked) {
        await restoreStockForOrderItems(toStockItems(locked.items), session);
      }

      await ReturnRequest.updateOne(
        { _id: locked._id },
        {
          gatewayRefundId,
          restocked: true,
          ...(order.paymentMethod === 'cod' && !locked.manualRefundNote
            ? { manualRefundNote: 'COD — process manual payout (bank / wallet / Vodafone Cash)' }
            : {}),
        },
        { session }
      );

      await syncOrderReturnState(order._id, session);
    });
  } finally {
    session.endSession();
  }

  return ReturnRequest.findById(returnRequest._id);
};
