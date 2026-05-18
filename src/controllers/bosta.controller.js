// src/controllers/bosta.controller.js
import asyncHandler from 'express-async-handler';
import Order from '../models/Order.js';
import ApiError from '../utils/apiError.js';
import sendResponse from '../utils/apiResponse.js';
import { getBostaCarrier } from '../utils/carriers/getBostaCarrier.js';
import {
  createBostaDelivery,
  trackBostaDelivery,
  cancelBostaDelivery,
} from '../utils/carriers/bosta.js';

/**
 * @desc    Create Bosta shipment for an order
 * @route   POST /api/v1/bosta/orders/:orderId/ship
 * @access  Admin
 */
export const createShipment = asyncHandler(async (req, res, next) => {
  const credentials = await getBostaCarrier();

  const order = await Order.findById(req.params.orderId).populate('user', 'name phone');
  if (!order) return next(new ApiError(`No order found with id: ${req.params.orderId}`, 404));

  if (order.bostaDeliveryId) {
    return next(new ApiError('Shipment already created for this order', 400));
  }

  if (!['pending', 'processing'].includes(order.orderStatus)) {
    return next(
      new ApiError('Shipment can only be created for pending or processing orders', 400)
    );
  }

  const { shippingAddress } = order;
  const delivery = await createBostaDelivery(
    {
      receiverName: order.user?.name || 'Customer',
      receiverPhone: order.user?.phone,
      receiverAddress: {
        city: shippingAddress.governorateName,
        zone: shippingAddress.districtName || shippingAddress.governorateName,
        firstLine: shippingAddress.addressLine,
      },
      cod: order.paymentMethod === 'cod' ? order.totalPrice : 0,
      businessReference: order._id.toString(),
      notes: req.body.notes || '',
    },
    credentials
  );

  const data = delivery.data ?? delivery;
  order.bostaDeliveryId = data._id ?? data.id;
  order.bostaTrackingNumber = data.trackingNumber;
  order.bostaStatus = data.state?.value || 'CREATED';
  order.orderStatus = 'processing';
  await order.save();

  sendResponse(res, {
    statusCode: 201,
    message: 'Shipment created successfully',
    data: {
      bostaDeliveryId: order.bostaDeliveryId,
      bostaTrackingNumber: order.bostaTrackingNumber,
    },
  });
});

/**
 * @desc    Track Bosta shipment for an order
 * @route   GET /api/v1/bosta/orders/:orderId/track
 * @access  Private (user owns order, or admin)
 */
export const trackShipment = asyncHandler(async (req, res, next) => {
  const credentials = await getBostaCarrier();

  const filter = { _id: req.params.orderId };
  if (req.user.role !== 'admin') {
    filter.user = req.user._id;
  }

  const order = await Order.findOne(filter);
  if (!order) return next(new ApiError(`No order found with id: ${req.params.orderId}`, 404));

  if (!order.bostaTrackingNumber) {
    return next(new ApiError('No shipment created for this order yet', 404));
  }

  const tracking = await trackBostaDelivery(order.bostaTrackingNumber, credentials);
  const trackingData = tracking.data ?? tracking;

  sendResponse(res, {
    message: 'Shipment tracking retrieved successfully',
    data: {
      trackingNumber: order.bostaTrackingNumber,
      currentStatus: trackingData.state,
      history: trackingData.TransitEvents || [],
    },
  });
});

/**
 * @desc    Cancel Bosta shipment for an order
 * @route   DELETE /api/v1/bosta/orders/:orderId/ship
 * @access  Admin
 */
export const cancelShipment = asyncHandler(async (req, res, next) => {
  const credentials = await getBostaCarrier();

  const order = await Order.findById(req.params.orderId);
  if (!order) return next(new ApiError(`No order found with id: ${req.params.orderId}`, 404));

  if (!order.bostaDeliveryId) {
    return next(new ApiError('No shipment to cancel', 404));
  }

  await cancelBostaDelivery(order.bostaDeliveryId, credentials);

  order.bostaDeliveryId = null;
  order.bostaTrackingNumber = null;
  order.bostaStatus = 'CANCELLED';
  await order.save();

  sendResponse(res, { message: 'Shipment cancelled successfully' });
});
