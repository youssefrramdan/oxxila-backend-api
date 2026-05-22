// src/utils/returns/state.js
import Order from '../../models/Order.js';
import ReturnRequest from '../../models/ReturnRequest.js';
import ApiError from '../apiError.js';
import { REFUND_STATUS_TRANSITIONS } from './constants.js';

export const validateStatusTransition = (current, next) => {
  const allowed = REFUND_STATUS_TRANSITIONS[current];
  if (!allowed?.includes(next)) {
    throw new ApiError(`Cannot change refund status from "${current}" to "${next}"`, 400);
  }
};

export const syncOrderReturnState = async (orderId, session) => {
  const order = await Order.findById(orderId).session(session);
  if (!order) return;

  const orderItemIds = order.items.map((i) => String(i._id));
  const orderedQty = Object.fromEntries(order.items.map((i) => [String(i._id), i.quantity]));

  const refundedReturns = await ReturnRequest.find({
    order: orderId,
    refundStatus: 'refunded',
  }).session(session);

  const returnedQty = {};
  for (const id of orderItemIds) returnedQty[id] = 0;

  for (const ret of refundedReturns) {
    for (const line of ret.items) {
      const key = String(line.orderItemId);
      returnedQty[key] = (returnedQty[key] || 0) + line.quantity;
    }
  }

  const allFullyReturned = orderItemIds.every((id) => (returnedQty[id] || 0) >= orderedQty[id]);

  const totalRefunded = refundedReturns.reduce((s, r) => s + (r.refundAmount || 0), 0);
  const updates = {};

  updates.orderStatus = allFullyReturned ? 'returned' : 'partially_returned';

  if (totalRefunded >= order.totalPrice - 0.01) {
    updates.paymentStatus = 'refunded';
  }

  await Order.findByIdAndUpdate(orderId, { $set: updates }, { session, runValidators: true });
};
