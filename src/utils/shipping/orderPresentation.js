// src/utils/shipping/orderPresentation.js

/** Single source for client + admin order status labels. */
export const ORDER_STATUS_LABELS = {
  pending: 'Order placed',
  confirmed: 'Confirmed',
  processing: 'Preparing shipment',
  shipped: 'On the way',
  out_for_delivery: 'Out for delivery',
  failed_attempt: 'Delivery attempt failed',
  returned: 'Returned',
  partially_returned: 'Partially returned',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

export const getOrderStatusLabel = (orderStatus) =>
  ORDER_STATUS_LABELS[orderStatus] ?? orderStatus ?? 'Unknown';

/** Paid / Not paid (+ Refunded) — same on every order response. */
export const getPaymentStatusLabel = ({ paymentStatus }) => {
  if (paymentStatus === 'paid') return 'Paid';
  if (paymentStatus === 'refunded') return 'Refunded';
  return 'Not paid';
};

export const getIsPaid = (paymentStatus) => paymentStatus === 'paid';

export const buildOrderPresentation = (order) => ({
  orderStatusLabel: getOrderStatusLabel(order?.orderStatus),
  paymentStatusLabel: getPaymentStatusLabel(order),
  isPaid: getIsPaid(order?.paymentStatus),
});
