// src/utils/returns/formatters.js
import { getOrderLineKey } from './lines.js';

export const formatEligibleOrder = (order, returnable) => {
  const deliveredAt = order.deliveredAt ? new Date(order.deliveredAt) : null;
  const daysSinceDelivery = deliveredAt
    ? Math.floor((Date.now() - deliveredAt.getTime()) / 86400000)
    : 0;

  const items = order.items.map((item, index) => {
    const lineKey = getOrderLineKey(item, index);
    return {
      orderItemId: lineKey,
      product: item.product,
      name: item.name,
      image: item.image,
      price: item.price,
      quantity: item.quantity,
      purchasedQuantity: item.quantity,
      returnableQuantity: returnable[lineKey] ?? 0,
    };
  });

  return {
    _id: String(order._id),
    orderStatus: order.orderStatus,
    deliveredAt: order.deliveredAt,
    daysSinceDelivery,
    totalPrice: order.totalPrice,
    paymentMethod: order.paymentMethod,
    items: items.filter((i) => i.returnableQuantity > 0),
  };
};
