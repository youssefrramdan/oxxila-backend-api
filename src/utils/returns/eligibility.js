// src/utils/returns/eligibility.js
import Order from '../../models/Order.js';
import ReturnRequest from '../../models/ReturnRequest.js';
import ApiError from '../apiError.js';
import { RETURN_WINDOW_DAYS, QUANTITY_RESERVED_STATUSES } from './constants.js';
import { getOrderLineKey } from './lines.js';

export const getReturnWindowEnd = (deliveredAt) => {
  const end = new Date(deliveredAt);
  end.setDate(end.getDate() + RETURN_WINDOW_DAYS);
  return end;
};

export const assertOrderReturnEligible = (order) => {
  if (!order) throw new ApiError('Order not found', 404);

  if (!['delivered', 'partially_returned'].includes(order.orderStatus)) {
    throw new ApiError(
      'Only delivered or partially returned orders are eligible for returns',
      400
    );
  }

  if (!order.deliveredAt) {
    throw new ApiError('Order has no delivery date; cannot start return window', 400);
  }

  if (new Date() > getReturnWindowEnd(order.deliveredAt)) {
    throw new ApiError(`Return window expired (${RETURN_WINDOW_DAYS} days after delivery)`, 400);
  }

  if (order.paymentStatus === 'refunded') {
    throw new ApiError('Order has already been fully refunded', 409);
  }
};

export const buildReturnableMapForOrder = (order, returns = []) => {
  const reservedByItem = new Map();
  for (const ret of returns) {
    for (const line of ret.items) {
      const key = String(line.orderItemId);
      reservedByItem.set(key, (reservedByItem.get(key) || 0) + line.quantity);
    }
  }

  const map = {};
  order.items.forEach((item, index) => {
    const id = getOrderLineKey(item, index);
    const reserved = reservedByItem.get(id) || reservedByItem.get(String(item._id)) || 0;
    map[id] = Math.max(0, item.quantity - reserved);
  });
  return map;
};

export const computeReturnableQuantitiesBatch = async (orders) => {
  const list = orders?.filter(Boolean) ?? [];
  if (!list.length) return new Map();

  const orderIds = list.map((o) => o._id);
  const returns = await ReturnRequest.find({
    order: { $in: orderIds },
    refundStatus: { $in: QUANTITY_RESERVED_STATUSES },
  }).lean();

  const returnsByOrder = new Map();
  for (const ret of returns) {
    const key = String(ret.order);
    if (!returnsByOrder.has(key)) returnsByOrder.set(key, []);
    returnsByOrder.get(key).push(ret);
  }

  const result = new Map();
  for (const order of list) {
    result.set(
      String(order._id),
      buildReturnableMapForOrder(order, returnsByOrder.get(String(order._id)) ?? [])
    );
  }
  return result;
};

export const computeReturnableQuantities = async (orderId, orderDoc = null) => {
  const order = orderDoc ?? (await Order.findById(orderId).lean());
  if (!order) return null;

  const returns = await ReturnRequest.find({
    order: orderId,
    refundStatus: { $in: QUANTITY_RESERVED_STATUSES },
  }).lean();

  return buildReturnableMapForOrder(order, returns);
};
