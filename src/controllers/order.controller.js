// src/controllers/order.controller.js
import asyncHandler from 'express-async-handler';
import Order from '../models/Order.js';
import ApiError from '../utils/apiError.js';
import sendResponse from '../utils/apiResponse.js';
import { prepareCheckoutFromCart, fulfillCheckout } from '../utils/checkoutHelpers.js';
import { queryPaginatedOrders } from '../utils/orderQueryHelpers.js';
import { processCardOrderRefund } from '../utils/orderRefundHelpers.js';

const findUserOrder = async (orderId, userId) =>
  Order.findOne({ _id: orderId, user: userId });

/**
 * @desc    Create COD order from cart (immediate fulfillment)
 * @route   POST /api/v1/orders
 * @access  Private
 */
export const createOrder = asyncHandler(async (req, res, next) => {
  const { governorateId, districtId, addressLine, paymentMethod } = req.body;

  if (paymentMethod !== 'cod') {
    return next(
      new ApiError(
        'Card payments must use POST /api/v1/orders/payment-session. Order is created after payment succeeds.',
        400
      )
    );
  }

  const checkout = await prepareCheckoutFromCart(req.user._id, {
    governorateId,
    districtId,
    addressLine,
  });

  const order = await fulfillCheckout(
    { ...checkout, userId: req.user._id },
    { method: 'cod', status: 'paid' }
  );

  sendResponse(res, {
    statusCode: 201,
    message: 'Order created successfully',
    data: order,
  });
});

/**
 * @desc    List current user's orders
 * @route   GET /api/v1/orders/my-orders
 * @access  Private
 */
export const getMyOrders = asyncHandler(async (req, res) => {
  const { orders, pagination } = await queryPaginatedOrders({ user: req.user._id }, req);

  sendResponse(res, {
    message: 'Orders retrieved successfully',
    data: orders,
    pagination,
  });
});

/**
 * @desc    Get one order for current user
 * @route   GET /api/v1/orders/my-orders/:id
 * @access  Private
 */
export const getMyOrder = asyncHandler(async (req, res, next) => {
  const order = await findUserOrder(req.params.id, req.user._id);
  if (!order) return next(new ApiError(`No order found with id: ${req.params.id}`, 404));

  sendResponse(res, { message: 'Order retrieved successfully', data: order });
});

/**
 * @desc    List all orders (admin)
 * @route   GET /api/v1/orders
 * @access  Admin
 */
export const getOrders = asyncHandler(async (req, res) => {
  const { orders, pagination } = await queryPaginatedOrders({}, req, { populateUser: true });

  sendResponse(res, {
    message: 'Orders retrieved successfully',
    data: orders,
    pagination,
  });
});

/**
 * @desc    Get one order (admin)
 * @route   GET /api/v1/orders/:id
 * @access  Admin
 */
export const getOrder = asyncHandler(async (req, res, next) => {
  const order = await Order.findById(req.params.id).populate('user', 'name email phone');
  if (!order) return next(new ApiError(`No order found with id: ${req.params.id}`, 404));

  sendResponse(res, { message: 'Order retrieved successfully', data: order });
});

/**
 * @desc    Update order status (admin)
 * @route   PATCH /api/v1/orders/:id/status
 * @access  Admin
 */
export const updateOrderStatus = asyncHandler(async (req, res, next) => {
  const existing = await Order.findById(req.params.id);
  if (!existing) return next(new ApiError(`No order found with id: ${req.params.id}`, 404));

  const update = { orderStatus: req.body.orderStatus };
  if (req.body.orderStatus === 'delivered' && !existing.deliveredAt) {
    update.deliveredAt = new Date();
  }

  const order = await Order.findByIdAndUpdate(req.params.id, update, {
    new: true,
    runValidators: true,
  });

  sendResponse(res, {
    message: 'Order status updated successfully',
    data: order,
  });
});

/**
 * @desc    Full refund for a paid card order — Stripe or Paymob (admin)
 * @route   POST /api/v1/orders/:id/refund
 * @access  Admin
 */
export const refundOrder = asyncHandler(async (req, res, next) => {
  const order = await Order.findById(req.params.id);
  if (!order) return next(new ApiError(`No order found with id: ${req.params.id}`, 404));

  const { order: updated, gatewayRefundId, alreadyRefunded } = await processCardOrderRefund(order);

  sendResponse(res, {
    message: alreadyRefunded ? 'Order is already refunded' : 'Order refunded successfully',
    data: {
      order: updated,
      gatewayRefundId,
      stripeRefundId: order.paymentProvider === 'stripe' ? gatewayRefundId : null,
    },
  });
});
