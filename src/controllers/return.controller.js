// src/controllers/return.controller.js
import asyncHandler from "express-async-handler";
import Order from "../models/Order.js";
import ReturnRequest from "../models/ReturnRequest.js";
import ApiError from "../utils/apiError.js";
import sendResponse from "../utils/apiResponse.js";
import ApiFeatures from "../utils/apiFeatures.js";
import {
  REASONS_REQUIRING_PROOF,
  isOrderReturnEligible,
  buildReturnLineItems,
  calculateRefundAmount,
  assertReturnStatusTransition,
  mapEligibleOrder,
} from "../utils/returnHelpers.js";
import { finalizeReturnRefund } from "../utils/returnRefundHelpers.js";
import { enrichReturnDocument } from "../utils/orderTracking.js";
import {
  createReturnBostaPickup,
  orderUsesBostaApi,
  syncReturnTrackingFromBosta,
} from "../utils/carriers/bostaFulfillment.js";

const parseJsonField = (value, fieldName) => {
  if (value == null) return value;
  if (typeof value === "object") return value;
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      throw new ApiError(`Invalid JSON for ${fieldName}`, 400);
    }
  }
  throw new ApiError(`Invalid ${fieldName}`, 400);
};

const shouldCreateBostaOnApprove = (returnRequest, nextStatus) =>
  nextStatus === "approved" &&
  returnRequest.returnMethod === "pickup" &&
  !returnRequest.bostaReturnDeliveryId;

/**
 * @desc    Delivered orders eligible for return (within window, returnable qty)
 * @route   GET /api/v1/returns/eligible-orders
 * @access  Private
 */
export const getEligibleReturnOrders = asyncHandler(async (req, res) => {
  const orders = await Order.find({
    user: req.user._id,
    orderStatus: { $in: ["delivered", "partially_returned"] },
    deliveredAt: { $ne: null, $exists: true }, // ← أضف $exists
  }).sort({ deliveredAt: -1 });
  const eligible = [];
  for (const order of orders) {
    if (!isOrderReturnEligible(order)) continue;
    const mapped = await mapEligibleOrder(order);
    if (mapped) eligible.push(mapped);
  }

  sendResponse(res, {
    message: "Eligible return orders retrieved successfully",
    data: eligible,
  });
});

/**
 * @desc    Submit a return request
 * @route   POST /api/v1/returns
 * @access  Private
 */
export const createReturnRequest = asyncHandler(async (req, res, next) => {
  const orderId = req.body.order;
  const items = parseJsonField(req.body.items, "items");
  const pickupAddress = parseJsonField(
    req.body.pickupAddress,
    "pickupAddress",
  ) ?? {
    city: req.body["pickupAddress.city"],
    governorate: req.body["pickupAddress.governorate"],
    address: req.body["pickupAddress.address"],
    governorateId: req.body["pickupAddress.governorateId"] ?? null,
    districtId: req.body["pickupAddress.districtId"] ?? null,
  };

  if (
    !pickupAddress?.city ||
    !pickupAddress?.governorate ||
    !pickupAddress?.address
  ) {
    return next(
      new ApiError(
        "pickupAddress with city, governorate, and address is required",
        400,
      ),
    );
  }

  const order = await Order.findOne({ _id: orderId, user: req.user._id });
  if (!order)
    return next(new ApiError(`No order found with id: ${orderId}`, 404));

  if (!isOrderReturnEligible(order)) {
    return next(
      new ApiError(
        "Order is not eligible for return. It must be delivered within the return window.",
        400,
      ),
    );
  }

  if (REASONS_REQUIRING_PROOF.has(req.body.reason)) {
    const proofCount = req.files?.length ?? 0;
    if (proofCount === 0) {
      return next(
        new ApiError(
          "Proof images are required for damaged, wrong product, or allergic reaction returns",
          400,
        ),
      );
    }
  }

  const returnItems = await buildReturnLineItems(order, items);
  const refundAmount = calculateRefundAmount(returnItems);
  const proofImages = (req.files ?? []).map((f) => f.path).filter(Boolean);

  const returnRequest = await ReturnRequest.create({
    order: order._id,
    user: req.user._id,
    items: returnItems,
    reason: req.body.reason,
    note: req.body.note?.trim() ?? "",
    proofImages,
    pickupAddress: {
      city: pickupAddress.city,
      governorate: pickupAddress.governorate,
      address: pickupAddress.address,
      governorateId: pickupAddress.governorateId ?? null,
      districtId: pickupAddress.districtId ?? null,
    },
    returnMethod: req.body.returnMethod,
    refundAmount,
    refundStatus: "pending",
  });

  sendResponse(res, {
    statusCode: 201,
    message: "Return request submitted successfully",
    data: enrichReturnDocument(returnRequest),
  });
});

/**
 * @desc    List current user's return requests
 * @route   GET /api/v1/returns/my-returns
 * @access  Private
 */
export const getMyReturnRequests = asyncHandler(async (req, res) => {
  const features = new ApiFeatures(
    ReturnRequest.find({ user: req.user._id }),
    req.query,
  )
    .filter()
    .sort()
    .limitFields();

  await features.paginate();

  const returns = await features.mongooseQuery.populate(
    "order",
    "orderStatus totalPrice deliveredAt",
  );
  const pagination = features.getPaginationResult();

  sendResponse(res, {
    message: "Return requests retrieved successfully",
    data: returns.map(enrichReturnDocument),
    pagination: { ...pagination, results: returns.length },
  });
});

/**
 * @desc    Get one return request for current user
 * @route   GET /api/v1/returns/my-returns/:id
 * @access  Private
 */
export const getMyReturnRequest = asyncHandler(async (req, res, next) => {
  const returnRequest = await ReturnRequest.findOne({
    _id: req.params.id,
    user: req.user._id,
  }).populate("order");

  if (!returnRequest) {
    return next(
      new ApiError(`No return request found with id: ${req.params.id}`, 404),
    );
  }

  sendResponse(res, {
    message: "Return request retrieved successfully",
    data: enrichReturnDocument(returnRequest),
  });
});

/**
 * @desc    List all return requests (admin)
 * @route   GET /api/v1/returns
 * @access  Admin
 */
export const getReturnRequests = asyncHandler(async (req, res) => {
  const features = new ApiFeatures(ReturnRequest.find(), req.query)
    .filter()
    .sort()
    .limitFields();

  await features.paginate();

  const returns = await features.mongooseQuery
    .populate("user", "name email phone")
    .populate("order", "orderStatus paymentMethod totalPrice deliveredAt");

  const pagination = features.getPaginationResult();

  sendResponse(res, {
    message: "Return requests retrieved successfully",
    data: returns.map(enrichReturnDocument),
    pagination: { ...pagination, results: returns.length },
  });
});

/**
 * @desc    Get one return request (admin)
 * @route   GET /api/v1/returns/:id
 * @access  Admin
 */
export const getReturnRequest = asyncHandler(async (req, res, next) => {
  const returnRequest = await ReturnRequest.findById(req.params.id)
    .populate("user", "name email phone")
    .populate("order");

  if (!returnRequest) {
    return next(
      new ApiError(`No return request found with id: ${req.params.id}`, 404),
    );
  }

  sendResponse(res, {
    message: "Return request retrieved successfully",
    data: enrichReturnDocument(returnRequest),
  });
});

/**
 * @desc    Advance return workflow (admin)
 * @route   PATCH /api/v1/returns/:id/status
 * @access  Admin
 */
export const updateReturnStatus = asyncHandler(async (req, res, next) => {
  const returnRequest = await ReturnRequest.findById(req.params.id);
  if (!returnRequest) {
    return next(
      new ApiError(`No return request found with id: ${req.params.id}`, 404),
    );
  }

  const nextStatus = req.body.refundStatus;
  assertReturnStatusTransition(returnRequest.refundStatus, nextStatus);

  if (nextStatus === "refunded") {
    if (req.body.manualRefundNote) {
      returnRequest.manualRefundNote = req.body.manualRefundNote;
      await returnRequest.save();
    }
    const finalized = await finalizeReturnRefund(returnRequest);
    return sendResponse(res, {
      message: "Return refunded successfully",
      data: enrichReturnDocument(finalized),
    });
  }

  if (shouldCreateBostaOnApprove(returnRequest, nextStatus)) {
    const order = await Order.findById(returnRequest.order).select(
      "fulfillment user",
    );

    if (await orderUsesBostaApi(order)) {
      if (!req.body.pickupLocationId) {
        return next(
          new ApiError(
            "pickupLocationId is required when approving a Bosta pickup return",
            400,
          ),
        );
      }

      try {
        await createReturnBostaPickup(returnRequest, order, {
          pickupLocationId: req.body.pickupLocationId,
          size: req.body.size,
        });
      } catch (err) {
        return next(
          new ApiError(
            err.message || "Failed to create Bosta return pickup",
            err.statusCode || 502,
          ),
        );
      }
    }
  }

  returnRequest.refundStatus = nextStatus;
  if (req.body.adminNote) returnRequest.adminNote = req.body.adminNote;
  if (req.body.manualRefundNote)
    returnRequest.manualRefundNote = req.body.manualRefundNote;
  await returnRequest.save();

  let updated = returnRequest;
  if (returnRequest.bostaReturnTrackingNumber) {
    updated = await syncReturnTrackingFromBosta(returnRequest);
  }

  sendResponse(res, {
    message: "Return request status updated successfully",
    data: enrichReturnDocument(updated),
  });
});

/**
 * @desc    Retry Bosta Customer Return Pickup for an approved return
 * @route   PATCH /api/v1/returns/:id/bosta-retry
 * @access  Admin
 */
export const retryBostaPickup = asyncHandler(async (req, res, next) => {
  const returnRequest = await ReturnRequest.findById(req.params.id);
  if (!returnRequest) {
    return next(
      new ApiError(`No return request found with id: ${req.params.id}`, 404),
    );
  }
  if (returnRequest.refundStatus !== "approved") {
    return next(new ApiError("Return must be approved first", 400));
  }
  if (returnRequest.returnMethod !== "pickup") {
    return next(new ApiError("Only pickup returns support Bosta", 400));
  }
  if (returnRequest.bostaReturnDeliveryId) {
    return next(new ApiError("Bosta return pickup already exists", 400));
  }
  if (!req.body.pickupLocationId) {
    return next(new ApiError("pickupLocationId is required", 400));
  }

  const order = await Order.findById(returnRequest.order).select(
    "fulfillment user",
  );

  await createReturnBostaPickup(returnRequest, order, {
    pickupLocationId: req.body.pickupLocationId,
    size: req.body.size || "MEDIUM",
  });
  await returnRequest.save();

  sendResponse(res, {
    message: "Bosta return pickup created successfully",
    data: enrichReturnDocument(returnRequest),
  });
});
