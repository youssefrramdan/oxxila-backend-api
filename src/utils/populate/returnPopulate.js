// src/utils/populate/returnPopulate.js

export const RETURN_ORDER_LIST_SELECT =
  'orderStatus deliveredAt totalPrice paymentMethod paymentStatus createdAt';

export const RETURN_ORDER_DETAIL_SELECT =
  'orderStatus deliveredAt totalPrice paymentMethod paymentStatus items subtotal shippingPrice';

export const returnPopulate = [
  { path: 'order', select: RETURN_ORDER_DETAIL_SELECT },
  { path: 'carrier', select: 'name code apiProvider' },
  { path: 'dropOffPickup', select: 'locationName bostaLocationId' },
];

export const returnListPopulate = [
  { path: 'user', select: 'name email phone' },
  { path: 'order', select: RETURN_ORDER_LIST_SELECT },
  { path: 'carrier', select: 'name code' },
  { path: 'dropOffPickup', select: 'locationName' },
];

export const returnMyListPopulate = [
  { path: 'order', select: RETURN_ORDER_LIST_SELECT },
];

export const returnAdminDetailPopulate = [
  { path: 'user', select: 'name email phone' },
  { path: 'order', select: RETURN_ORDER_DETAIL_SELECT },
  { path: 'carrier', select: 'name code apiProvider' },
  { path: 'dropOffPickup', select: 'locationName bostaLocationId' },
];
