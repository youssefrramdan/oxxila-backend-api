// src/controllers/tracking.controller.js
import asyncHandler from 'express-async-handler';
import Order from '../models/Order.js';
import Shipment from '../models/Shipment.js';
import ApiError from '../utils/apiError.js';
import sendResponse from '../utils/apiResponse.js';
import { enrichOrderDocument } from './order.controller.js';

const publicTrackFields =
  '_id orderStatus paymentStatus paymentMethod totalPrice createdAt shippingAddress';

/** Build the public tracking payload from an order and optional shipment */
const buildTrackResponse = (order, shipment) => {
  const enriched = enrichOrderDocument(order, shipment);
  return {
    orderId: enriched._id,
    orderStatus: enriched.orderStatus,
    orderStatusLabel: enriched.orderStatusLabel,
    paymentStatus: enriched.paymentStatus,
    paymentStatusLabel: enriched.paymentStatusLabel,
    isPaid: enriched.isPaid,
    paymentMethod: enriched.paymentMethod,
    total: enriched.totalPrice,
    createdAt: enriched.createdAt,
    shippingAddress: {
      governorateName: enriched.shippingAddress?.governorateName,
      districtName: enriched.shippingAddress?.districtName,
    },
    shipment: enriched.shipment,
    tracking: enriched.tracking,
  };
};

/**
 * @desc    Track shipment by tracking number (public)
 * @route   GET /api/v1/track/:trackingNumber
 * @access  Public
 */
export const trackByTrackingNumber = asyncHandler(async (req, res, next) => {
  const trackingNumber = String(req.params.trackingNumber || '').trim();
  if (!trackingNumber) {
    return next(new ApiError('Tracking number is required', 400));
  }

  const shipment = await Shipment.findOne({ trackingNumber }).lean();
  if (!shipment) {
    return next(new ApiError('No shipment found with this tracking number', 404));
  }

  const order = await Order.findById(shipment.order).select(publicTrackFields).lean();
  if (!order) {
    return next(new ApiError('Order not found for this tracking number', 404));
  }

  sendResponse(res, {
    message: 'Tracking retrieved successfully',
    data: buildTrackResponse(order, shipment),
  });
});

/**
 * @desc    Track own order by id (includes pre-shipment status)
 * @route   GET /api/v1/track/order/:orderId
 * @access  Private
 */
export const trackMyOrder = asyncHandler(async (req, res, next) => {
  const order = await Order.findOne({ _id: req.params.orderId, user: req.user._id })
    .select(publicTrackFields)
    .lean();
  if (!order) {
    return next(new ApiError(`No order found with id: ${req.params.orderId}`, 404));
  }

  const shipment = await Shipment.findOne({ order: order._id }).lean();
  sendResponse(res, {
    message: 'Order tracking retrieved successfully',
    data: buildTrackResponse(order, shipment),
  });
});
