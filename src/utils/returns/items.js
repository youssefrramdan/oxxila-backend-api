// src/utils/returns/items.js
import ApiError from '../apiError.js';
import { computeReturnableQuantities } from './eligibility.js';
import { getOrderLineKey, resolveOrderLine } from './lines.js';

export { getOrderLineKey, resolveOrderLine } from './lines.js';

export const calculateRefundAmount = (order, returnItems) => {
  const lineSubtotal = returnItems.reduce((sum, i) => sum + i.price * i.quantity, 0);
  if (!order.subtotal || order.subtotal <= 0) {
    return Math.round(lineSubtotal * 100) / 100;
  }
  const ratio = order.totalPrice / order.subtotal;
  return Math.max(0, Math.round(lineSubtotal * ratio * 100) / 100);
};

export const buildReturnItems = async (order, requestedItems) => {
  const returnable = await computeReturnableQuantities(order._id, order);
  const built = [];

  for (const req of requestedItems) {
    const orderItemId = String(req.orderItemId).trim();
    const qty = Number(req.quantity);
    if (!Number.isFinite(qty) || qty < 1) {
      throw new ApiError('Each return item must have quantity at least 1', 400);
    }

    const orderLine = resolveOrderLine(order, orderItemId);
    if (!orderLine) {
      throw new ApiError(`No order line found with id: ${orderItemId}`, 400);
    }

    const lineIndex = order.items.findIndex((i) => i === orderLine);
    const lineKey = lineIndex >= 0 ? getOrderLineKey(orderLine, lineIndex) : orderItemId;
    const available = returnable[lineKey] ?? returnable[orderItemId] ?? 0;
    if (qty > available) {
      throw new ApiError(
        `Return quantity exceeds returnable amount for "${orderLine.name}" (max ${available})`,
        400
      );
    }

    built.push({
      orderItemId: orderLine._id || lineKey,
      product: orderLine.product,
      name: orderLine.name,
      price: orderLine.price,
      quantity: qty,
    });
  }

  return built;
};
