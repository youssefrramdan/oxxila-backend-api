// src/utils/orderQueryHelpers.js
import Order from '../models/Order.js';
import ApiFeatures from './apiFeatures.js';

export const queryPaginatedOrders = async (filter, req, { populateUser = false } = {}) => {
  const features = new ApiFeatures(Order.find(filter), req.query)
    .filter()
    .sort()
    .limitFields();

  await features.paginate();

  let query = features.mongooseQuery;
  if (populateUser) {
    query = query.populate('user', 'name email phone');
  }

  const orders = await query;
  const pagination = features.getPaginationResult();

  return { orders, pagination: { ...pagination, results: orders.length } };
};
