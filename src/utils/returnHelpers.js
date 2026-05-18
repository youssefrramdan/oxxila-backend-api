// src/utils/returnHelpers.js
import ReturnRequest from '../models/ReturnRequest.js';
import ApiError from './apiError.js';

export const RETURN_REASONS = [
  'damaged_item',
  'wrong_product',
  'allergic_reaction',
  'expired_product',
  'changed_mind',
  'other',
];

export const REASONS_REQUIRING_PROOF = new Set([
  'damaged_item',
  'wrong_product',
  'allergic_reaction',
]);

export const RESERVED_RETURN_STATUSES = [
  'pending',
  'approved',
  'picked_up',
  'received',
  'refunded',
];

export const RETURN_STATUS_TRANSITIONS = {
  pending: ['approved', 'rejected'],
  approved: ['picked_up', 'rejected'],
  picked_up: ['received'],
  received: ['refunded'],
  rejected: [],
  refunded: [],
};

export const getReturnWindowDays = () =>
  Number(process.env.RETURN_WINDOW_DAYS) > 0
    ? Number(process.env.RETURN_WINDOW_DAYS)
    : 14;

export const getReturnWindowMs = () => getReturnWindowDays() * 24 * 60 * 60 * 1000;

export const isOrderReturnEligible = (order) => {
  if (!['delivered', 'partially_returned'].includes(order.orderStatus)) {
    return false;
  }
  if (!order.deliveredAt) {
    return false;
  }
  const elapsed = Date.now() - new Date(order.deliveredAt).getTime();
  return elapsed <= getReturnWindowMs();
};

export const getReturnWindowEnd = (deliveredAt) =>
  new Date(new Date(deliveredAt).getTime() + getReturnWindowMs());

const itemKey = (orderItemId) => String(orderItemId);

export const getReservedReturnQuantities = async (orderId, excludeReturnId = null) => {
  const filter = {
    order: orderId,
    refundStatus: { $in: RESERVED_RETURN_STATUSES },
  };
  if (excludeReturnId) {
    filter._id = { $ne: excludeReturnId };
  }

  const requests = await ReturnRequest.find(filter).select('items').lean();
  const map = new Map();

  for (const req of requests) {
    for (const line of req.items) {
      const key = itemKey(line.orderItemId);
      map.set(key, (map.get(key) ?? 0) + line.quantity);
    }
  }

  return map;
};

export const findOrderLine = (order, orderItemId) => {
  const line = order.items.id(orderItemId);
  if (!line) {
    throw new ApiError('One or more selected items are not part of this order', 400);
  }
  return line;
};

export const buildReturnLineItems = async (order, selectedItems) => {
  const reserved = await getReservedReturnQuantities(order._id);
  const lines = [];

  for (const sel of selectedItems) {
    const orderLine = findOrderLine(order, sel.orderItemId);
    const key = itemKey(orderLine._id);
    const already = reserved.get(key) ?? 0;
    const returnable = orderLine.quantity - already;

    if (sel.quantity > returnable) {
      throw new ApiError(
        `Return quantity for "${orderLine.name}" exceeds returnable amount (${returnable} available)`,
        400
      );
    }

    lines.push({
      orderItemId: orderLine._id,
      product: orderLine.product,
      name: orderLine.name,
      price: orderLine.price,
      quantity: sel.quantity,
    });
  }

  return lines;
};

export const calculateRefundAmount = (lines) =>
  Math.round(lines.reduce((sum, line) => sum + line.price * line.quantity, 0) * 100) / 100;

export const assertReturnStatusTransition = (current, next) => {
  const allowed = RETURN_STATUS_TRANSITIONS[current];
  if (!allowed?.includes(next)) {
    throw new ApiError(`Cannot change return status from "${current}" to "${next}"`, 400);
  }
};

export const mapEligibleOrder = async (order) => {
  const reserved = await getReservedReturnQuantities(order._id);
  const deliveredAt = order.deliveredAt;
  const items = order.items
    .map((line) => {
      const returnable = line.quantity - (reserved.get(itemKey(line._id)) ?? 0);
      if (returnable <= 0) return null;

      return {
        orderItemId: line._id,
        product: line.product,
        name: line.name,
        image: line.image,
        price: line.price,
        purchasedQuantity: line.quantity,
        returnableQuantity: returnable,
      };
    })
    .filter(Boolean);

  if (!items.length) return null;

  return {
    _id: order._id,
    orderStatus: order.orderStatus,
    paymentMethod: order.paymentMethod,
    totalPrice: order.totalPrice,
    deliveredAt,
    returnWindowEndsAt: getReturnWindowEnd(deliveredAt),
    daysSinceDelivery: Math.floor(
      (Date.now() - new Date(deliveredAt).getTime()) / (24 * 60 * 60 * 1000)
    ),
    items,
  };
};
