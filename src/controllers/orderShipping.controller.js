// src/controllers/orderShipping.controller.js
import asyncHandler from 'express-async-handler';
import Order from '../models/Order.js';
import Carrier from '../models/Carrier.js';
import CarrierCoverage from '../models/CarrierCoverage.js';
import Shipment from '../models/Shipment.js';
import CarrierZoneMapping from '../models/CarrierZoneMapping.js';
import CarrierPickup from '../models/CarrierPickup.js';
import ApiError from '../utils/apiError.js';
import sendResponse from '../utils/apiResponse.js';
import { assignOrderToCarrier } from '../utils/carriers/assignOrderShipping.js';
import { enrichOrderDocument } from '../utils/orderTracking.js';
import { toPlainDoc } from '../utils/toPlainDoc.js';

/**
 * @desc    Order detail + assignable carriers for shipping admin
 * @route   GET /api/v1/admin/shipping/orders/:id
 * @access  Admin
 */
export const getOrderShippingDetail = asyncHandler(async (req, res, next) => {
  const order = await Order.findById(req.params.id).populate('user', 'name email phone');
  if (!order) return next(new ApiError(`No order found with id: ${req.params.id}`, 404));

  const shipment = await Shipment.findOne({ order: order._id }).lean();

  const coverages = await CarrierCoverage.find({
    governorate: order.shippingAddress.governorateId,
    isActive: true,
  }).select('carrier');

  const coveredIds = coverages.map((c) => c.carrier);
  const carriers = await Carrier.find({ isActive: true })
    .select('name code type apiProvider isActive')
    .sort({ type: 1, name: 1 })
    .lean();

  let zoneMapping = null;
  if (order.shippingAddress.districtId) {
    zoneMapping = await CarrierZoneMapping.findOne({
      zoneType: 'district',
      zoneId: order.shippingAddress.districtId,
      isServiceable: true,
    })
      .populate('carrier', 'name code')
      .lean();
  }

  const bostaCarrierIds = carriers
    .filter((c) => c.type === 'api' && c.apiProvider === 'bosta')
    .map((c) => c._id);

  const pickupDocs = bostaCarrierIds.length
    ? await CarrierPickup.find({ carrier: { $in: bostaCarrierIds } })
        .select('carrier locationName bostaLocationId isDefault address.city address.districtName')
        .sort({ isDefault: -1, locationName: 1 })
        .limit(200)
        .lean()
    : [];

  const pickupsByCarrier = {};
  for (const p of pickupDocs) {
    const key = p.carrier.toString();
    if (!pickupsByCarrier[key]) pickupsByCarrier[key] = [];
    pickupsByCarrier[key].push({
      _id: p._id,
      locationName: p.locationName,
      isDefault: p.isDefault,
      bostaLocationId: p.bostaLocationId,
      city: p.address?.city,
      districtName: p.address?.districtName,
    });
  }

  const data = {
    order: enrichOrderDocument(order, shipment),
    shipment,
    zoneMapping,
    pickupsByCarrier,
    carriers: carriers.map((c) => {
      const cid = c._id.toString();
      const pickupCount =
        c.type === 'api' && c.apiProvider === 'bosta'
          ? (pickupsByCarrier[cid]?.length ?? 0)
          : 0;
      return {
        ...toPlainDoc(c),
        coversGovernorate: coveredIds.some((id) => id.toString() === c._id.toString()),
        pickupCount,
        hasPickups: c.type !== 'api' || c.apiProvider !== 'bosta' || pickupCount > 0,
      };
    }),
  };

  sendResponse(res, {
    message: 'Order shipping detail retrieved successfully',
    data,
  });
});

/**
 * @desc    Assign carrier to order (Bosta API or manual known/internal)
 * @route   POST /api/v1/admin/shipping/orders/:id/assign
 * @access  Admin
 */
export const assignOrderShipping = asyncHandler(async (req, res, next) => {
  const order = await Order.findById(req.params.id);
  if (!order) return next(new ApiError(`No order found with id: ${req.params.id}`, 404));

  const carrier = await Carrier.findById(req.body.carrierId);
  if (!carrier) return next(new ApiError(`No carrier found with id: ${req.body.carrierId}`, 404));
  if (!carrier.isActive) return next(new ApiError('Carrier is not active', 400));

  try {
    const updated = await assignOrderToCarrier(order, carrier, req.user._id, {
      driverName: req.body.driverName,
      driverPhone: req.body.driverPhone,
      trackingNumber: req.body.trackingNumber,
      notes: req.body.notes,
      markShipped: req.body.markShipped,
      size: req.body.size,
      pickupId: req.body.pickupId,
    });

    const shipment = await Shipment.findOne({ order: updated._id }).lean();
    sendResponse(res, {
      message: 'Carrier assigned to order successfully',
      data: enrichOrderDocument(updated, shipment),
    });
  } catch (err) {
    if (err.statusCode) return next(new ApiError(err.message, err.statusCode));
    throw err;
  }
});
