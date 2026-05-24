// src/controllers/return.controller.js
import asyncHandler from 'express-async-handler';
import Order from '../models/Order.js';
import ReturnRequest from '../models/ReturnRequest.js';
import ApiError from '../utils/apiError.js';
import ApiFeatures from '../utils/apiFeatures.js';
import sendResponse from '../utils/apiResponse.js';
import {
  assertOrderReturnEligible,
  assertProofForReason,
  buildReturnItems,
  calculateRefundAmount,
  collectProofImages,
  formatEligibleOrder,
  computeReturnableQuantitiesBatch,
  getReturnWindowEnd,
  RETURN_WINDOW_DAYS,
  parseReturnCreateBody,
  resolveLogisticsOnApprove,
  validateStatusTransition,
} from '../utils/returnHelpers.js';
import { finalizeReturnRefund } from '../utils/returnRefundHelpers.js';
import { createBostaReturnForReturnRequest } from '../utils/carriers/bosta/returns.js';
import {
  returnPopulate,
  returnListPopulate,
  returnMyListPopulate,
  returnAdminDetailPopulate,
} from '../utils/populate/returnPopulate.js';

const findUserReturn = (id, userId) =>
  ReturnRequest.findOne({ _id: id, user: userId });

export const getEligibleReturnOrders = asyncHandler(async (req, res) => {
  const windowCutoff = new Date();
  windowCutoff.setDate(windowCutoff.getDate() - RETURN_WINDOW_DAYS);

  const mongoFilter = {
    user: req.user._id,
    orderStatus: { $in: ['delivered', 'partially_returned'] },
    deliveredAt: { $ne: null, $gte: windowCutoff },
    paymentStatus: { $ne: 'refunded' },
  };

  const features = new ApiFeatures(
    Order.find(mongoFilter).select(
      'orderStatus deliveredAt totalPrice paymentMethod paymentStatus items'
    ),
    req.query
  ).sort();

  await features.paginate();

  const orders = await features.mongooseQuery.lean();
  const returnableByOrder = await computeReturnableQuantitiesBatch(orders);
  const now = Date.now();

  const eligible = orders
    .filter((order) => now <= getReturnWindowEnd(order.deliveredAt).getTime())
    .map((order) => formatEligibleOrder(order, returnableByOrder.get(String(order._id)) ?? {}))
    .filter((formatted) => formatted.items.length > 0);

  sendResponse(res, {
    message: 'Eligible return orders retrieved successfully',
    data: eligible,
    pagination: { ...features.getPaginationResult(), results: eligible.length },
  });
});

export const createReturnRequest = asyncHandler(async (req, res, next) => {
  const body = parseReturnCreateBody(req);
  req.body = body;

  const order = await Order.findOne({ _id: body.order, user: req.user._id });
  if (!order) return next(new ApiError(`No order found with id: ${body.order}`, 404));

  assertOrderReturnEligible(order);

  const proofImages = collectProofImages(req);
  assertProofForReason(body.reason, proofImages);

  const returnItems = await buildReturnItems(order, body.items);
  const refundAmount = calculateRefundAmount(order, returnItems);

  const doc = await ReturnRequest.create({
    order: order._id,
    user: req.user._id,
    items: returnItems,
    reason: body.reason,
    note: body.note?.trim() || '',
    proofImages,
    pickupAddress: body.pickupAddress,
    contactPhone: body.contactPhone?.trim() || req.user.phone || null,
    refundAmount,
    refundStatus: 'pending',
  });

  const populated = await ReturnRequest.findById(doc._id).populate(returnPopulate).lean();

  sendResponse(res, {
    statusCode: 201,
    message: 'Return request created successfully',
    data: populated,
  });
});

export const getMyReturns = asyncHandler(async (req, res) => {
  const features = new ApiFeatures(
    ReturnRequest.find({ user: req.user._id }),
    req.query
  )
    .filter()
    .sort()
    .limitFields();

  await features.paginate();

  const returns = await features.mongooseQuery.populate(returnMyListPopulate).lean();

  sendResponse(res, {
    message: 'Return requests retrieved successfully',
    data: returns,
    pagination: { ...features.getPaginationResult(), results: returns.length },
  });
});

export const getMyReturn = asyncHandler(async (req, res, next) => {
  const doc = await findUserReturn(req.params.id, req.user._id).populate(returnPopulate).lean();
  if (!doc) return next(new ApiError(`No return request found with id: ${req.params.id}`, 404));

  sendResponse(res, {
    message: 'Return request retrieved successfully',
    data: doc,
  });
});

export const getReturns = asyncHandler(async (req, res) => {
  const features = new ApiFeatures(ReturnRequest.find(), req.query)
    .filter()
    .sort()
    .limitFields();

  await features.paginate();

  const returns = await features.mongooseQuery.populate(returnListPopulate).lean();

  sendResponse(res, {
    message: 'Return requests retrieved successfully',
    data: returns,
    pagination: { ...features.getPaginationResult(), results: returns.length },
  });
});

export const getReturn = asyncHandler(async (req, res, next) => {
  const doc = await ReturnRequest.findById(req.params.id)
    .populate(returnAdminDetailPopulate)
    .lean();

  if (!doc) return next(new ApiError(`No return request found with id: ${req.params.id}`, 404));

  sendResponse(res, {
    message: 'Return request retrieved successfully',
    data: doc,
  });
});

export const updateReturnStatus = asyncHandler(async (req, res, next) => {
  const doc = await ReturnRequest.findById(req.params.id);
  if (!doc) return next(new ApiError(`No return request found with id: ${req.params.id}`, 404));

  const nextStatus = req.body.refundStatus;
  validateStatusTransition(doc.refundStatus, nextStatus);

  const updates = { refundStatus: nextStatus };

  if (nextStatus === 'approved') {
    const logistics = await resolveLogisticsOnApprove({
      logisticsHandler: req.body.logisticsHandler,
      carrierId: req.body.carrierId,
      dropOffPickupId: req.body.dropOffPickupId,
    });
    Object.assign(updates, logistics);
  }

  if (nextStatus === 'rejected') {
    updates.adminNote = req.body.adminNote?.trim() || null;
  }

  if (nextStatus === 'refunded') {
    if (doc.refundStatus !== 'received') {
      return next(new ApiError('Return must be received before refunding', 400));
    }

    const order = await Order.findById(doc.order);
    if (!order) return next(new ApiError('Linked order not found', 404));

    const { returnRequest, gatewayRefundId, storeCreditIssued } = await finalizeReturnRefund(
      doc,
      order
    );

    const populated = await ReturnRequest.findById(returnRequest._id)
      .populate(returnPopulate)
      .lean();

    const isCod = order.paymentMethod === 'cod';
    const message = isCod
      ? 'Return refunded successfully; store credit issued to customer'
      : 'Return refunded successfully';

    return sendResponse(res, {
      message,
      data: {
        returnRequest: populated,
        gatewayRefundId,
        storeCreditIssued: isCod ? storeCreditIssued : false,
        refundAmount: returnRequest.refundAmount,
      },
    });
  }

  const updated = await ReturnRequest.findByIdAndUpdate(doc._id, updates, {
    returnDocument: 'after',
    runValidators: true,
  })
    .populate(returnPopulate)
    .lean();

  sendResponse(res, {
    message: 'Return status updated successfully',
    data: updated,
  });
});

export const scheduleBostaReturn = asyncHandler(async (req, res, next) => {
  const doc = await ReturnRequest.findById(req.params.id);
  if (!doc) return next(new ApiError(`No return request found with id: ${req.params.id}`, 404));

  if (doc.logisticsHandler !== 'bosta') {
    return next(new ApiError('Return logistics handler is not Bosta', 400));
  }

  if (!['approved', 'picked_up'].includes(doc.refundStatus)) {
    return next(
      new ApiError('Bosta return can only be scheduled after approval', 400)
    );
  }

  const order = await Order.findById(doc.order);
  if (!order) return next(new ApiError('Linked order not found', 404));

  const result = await createBostaReturnForReturnRequest(doc, order);

  const updated = await ReturnRequest.findByIdAndUpdate(
    doc._id,
    {
      bostaExternalId: result.externalDeliveryId,
      bostaTrackingNumber: result.trackingNumber,
      bostaState: result.providerState,
      bostaStateLabel: result.providerStateLabel,
      logisticsScheduledAt: new Date(),
    },
    { returnDocument: 'after', runValidators: true }
  ).populate(returnPopulate);

  sendResponse(res, {
    message: result.alreadyScheduled
      ? 'Bosta return was already scheduled'
      : 'Bosta return scheduled successfully',
    data: { returnRequest: updated, ...result },
  });
});
