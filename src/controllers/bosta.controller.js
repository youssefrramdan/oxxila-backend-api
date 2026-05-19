// src/controllers/bosta.controller.js
import asyncHandler from 'express-async-handler';
import Order from '../models/Order.js';
import ApiError from '../utils/apiError.js';
import sendResponse from '../utils/apiResponse.js';
import { getBostaCarrier } from '../utils/carriers/getBostaCarrier.js';
import {
  buildBostaAddress,
  createBostaDelivery,
  trackBostaDelivery,
  cancelBostaDelivery,
} from '../utils/carriers/bosta.js';

const mapBostaError = (err, next) => {
  let message = err.bostaError?.message || err.message || 'Bosta request failed';
  if (/reading ['"]city['"]/.test(message)) {
    message =
      'Bosta pickup address is missing. In stg-business.bosta.co add a pickup location under Settings, or set BOSTA_PICKUP_CITY and BOSTA_PICKUP_FIRST_LINE in .env';
  }
  return next(new ApiError(message, err.statusCode || 502));
};

const orderItemsCount = (items) =>
  items.reduce((sum, item) => sum + (item.quantity || 0), 0);

const defaultShipmentDescription = (order) => {
  const preview = order.items
    .slice(0, 3)
    .map((item) => `${item.name}×${item.quantity}`)
    .join(', ');
  const extra = order.items.length > 3 ? ` (+${order.items.length - 3} more)` : '';
  return `Oxxila order: ${preview}${extra}`.slice(0, 500);
};

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

  if (!order.user?.phone) {
    return next(
      new ApiError('Customer phone is required on the user profile before creating a Bosta shipment', 400)
    );
  }

  const { shippingAddress } = order;
  if (!shippingAddress?.governorateName || !shippingAddress?.addressLine) {
    return next(new ApiError('Order is missing a valid shipping address', 400));
  }

  const dropOffAddress = buildBostaAddress({
    city: shippingAddress.governorateName,
    zone: shippingAddress.districtName || shippingAddress.governorateName,
    districtName: shippingAddress.districtName,  // ← ضيف السطر ده
    firstLine: shippingAddress.addressLine,
  });


  let delivery;
  try {
    delivery = await createBostaDelivery(
      {
        receiverName: order.user.name,
        receiverPhone: order.user.phone,
        dropOffAddress,
        cod: order.paymentMethod === 'cod' ? order.totalPrice : 0,
        businessReference: order._id.toString(),
        notes: req.body.notes || '',
        packageSpecs: {
          packageType: req.body.packageType || 'Parcel',
          size: req.body.size || 'MEDIUM',
          itemsCount: req.body.itemsCount ?? orderItemsCount(order.items),
          description: req.body.description?.trim() || defaultShipmentDescription(order),
        },
      },
      credentials
    );
  } catch (err) {
    return mapBostaError(err, next);
  }

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

  let tracking;
  try {
    tracking = await trackBostaDelivery(order.bostaTrackingNumber, credentials);
  } catch (err) {
    return mapBostaError(err, next);
  }
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

  try {
    await cancelBostaDelivery(order.bostaDeliveryId, credentials);
  } catch (err) {
    return mapBostaError(err, next);
  }

  order.bostaDeliveryId = null;
  order.bostaTrackingNumber = null;
  order.bostaStatus = 'CANCELLED';
  await order.save();

  sendResponse(res, { message: 'Shipment cancelled successfully' });
});
