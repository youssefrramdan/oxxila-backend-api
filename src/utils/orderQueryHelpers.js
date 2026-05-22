// src/utils/orderQueryHelpers.js
import Order from '../models/Order.js';
import ApiFeatures from './apiFeatures.js';

export const ORDER_LIST_SELECT =
  'user shippingAddress shipping subtotal shippingPrice discountAmount totalPrice couponCode paymentMethod paymentProvider paymentStatus orderStatus deliveredAt cancelledAt cancellationReason cancelledBy createdAt updatedAt';

export const queryPaginatedOrders = async (filter, req, { populateUser = false } = {}) => {
  const features = new ApiFeatures(Order.find(filter), req.query).filter().sort().limitFields();

  await features.paginate();

  let query = features.mongooseQuery;
  if (!req.query.fields) {
    query = query.select(ORDER_LIST_SELECT);
  }
  if (populateUser) {
    query = query.populate('user', 'name email phone');
  }

  const orders = await query.lean();
  const pagination = features.getPaginationResult();

  return { orders, pagination: { ...pagination, results: orders.length } };
};

export const loadOrderItemCounts = async (orderIds) => {
  if (!orderIds?.length) return new Map();

  const rows = await Order.aggregate([
    { $match: { _id: { $in: orderIds } } },
    { $project: { itemCount: { $size: '$items' } } },
  ]);

  return new Map(rows.map((r) => [String(r._id), r.itemCount]));
};
