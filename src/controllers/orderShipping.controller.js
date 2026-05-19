// src/controllers/orderShipping.controller.js
import asyncHandler from 'express-async-handler';
import Order from '../models/Order.js';
import Carrier from '../models/Carrier.js';
import CarrierCoverage from '../models/CarrierCoverage.js';
import District from '../models/District.js';
import CarrierPickup from '../models/CarrierPickup.js';
import ApiError from '../utils/apiError.js';
import sendResponse from '../utils/apiResponse.js';
import { assignOrderToCarrier } from '../utils/carriers/assignOrderShipping.js';

/**
 * @desc    Order detail + assignable carriers for shipping admin
 * @route   GET /api/v1/admin/shipping/orders/:id
 * @access  Admin
 */
export const getOrderShippingDetail = asyncHandler(async (req, res, next) => {
  const order = await Order.findById(req.params.id).populate('user', 'name email phone');
  if (!order) return next(new ApiError(`No order found with id: ${req.params.id}`, 404));

  const coverages = await CarrierCoverage.find({
    governorate: order.shippingAddress.governorateId,
    isActive: true,
  }).select('carrier');

  const coveredIds = coverages.map((c) => c.carrier);
  const carriers = await Carrier.find({ isActive: true }).sort({ type: 1, name: 1 });

  let districtBosta = null;
  if (order.shippingAddress.districtId) {
    districtBosta = await District.findById(order.shippingAddress.districtId).select(
      'bostaApiCovered bostaDistrictId name'
    );
  }

  const bostaPickupCarrierIds = new Set(
    (
      await CarrierPickup.find({ isDefault: true }).distinct('carrier')
    ).map((id) => id.toString())
  );

  const data = {
    order,
    districtBosta,
    carriers: carriers.map((c) => ({
      ...c.toObject(),
      coversGovernorate: coveredIds.some((id) => id.toString() === c._id.toString()),
      hasDefaultPickup:
        c.apiProvider !== 'bosta' || c.type !== 'api' || bostaPickupCarrierIds.has(c._id.toString()),
    })),
  };

  sendResponse(res, { message: 'Order shipping detail retrieved successfully', data });
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
    });

    sendResponse(res, {
      message: 'Carrier assigned to order successfully',
      data: updated,
    });
  } catch (err) {
    if (err.statusCode) return next(new ApiError(err.message, err.statusCode));
    throw err;
  }
});
