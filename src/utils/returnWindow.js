// src/utils/returnWindow.js

/** Days after delivery during which a customer may start a return. */
export const RETURN_WINDOW_DAYS = Number(process.env.RETURN_WINDOW_DAYS) || 14;

/** End of the return window for a delivery date. */
export const getReturnWindowEnd = (deliveredAt) => {
  const end = new Date(deliveredAt);
  end.setDate(end.getDate() + RETURN_WINDOW_DAYS);
  return end;
};

/** True when a delivered order can still be returned (single source for API + UI flags). */
export const isWithinReturnWindow = (order, now = new Date()) =>
  ['delivered', 'partially_returned'].includes(order?.orderStatus) &&
  Boolean(order?.deliveredAt) &&
  order?.paymentStatus !== 'refunded' &&
  now <= getReturnWindowEnd(order.deliveredAt);
