// src/controllers/return.controller.js
import asyncHandler from "express-async-handler";
import mongoose from "mongoose";
import Carrier from "../models/Carrier.js";
import CarrierPickup from "../models/CarrierPickup.js";
import Order from "../models/Order.js";
import ReturnRequest from "../models/ReturnRequest.js";
import User from "../models/User.js";
import StoreCreditTransaction from "../models/StoreCreditTransaction.js";
import ApiError from "../utils/apiError.js";
import ApiFeatures from "../utils/apiFeatures.js";
import sendResponse from "../utils/apiResponse.js";
import { restoreStockForOrderItems, toMinorUnits, resolveZoneRefs } from "./order.controller.js";
import { pickupDocToBostaAddress } from "./carrierPickup.controller.js";
import {
  getBostaCredentials,
  formatBostaError,
  isUncoveredAddressError,
  normalizeEgyptPhone,
  buildBostaAddress,
  applyBostaAddressDefaults,
  getCarrierZoneMapping,
  buildDropOffFromMapping,
  enrichBostaAddress,
  assertDropOffAddressReady,
  buildBostaDeliveryBody,
  postBostaDelivery,
  normalizeBostaDeliveryApiResult,
  BOSTA_DELIVERY_TYPE_RETURN,
  parseBostaStateParts,
  mapBostaStateToPhase,
} from "./orderShipping.controller.js";
import {
  returnPopulate,
  returnListPopulate,
  returnMyListPopulate,
  returnAdminDetailPopulate,
} from "../utils/populate/returnPopulate.js";

// --- constants ---

const RETURN_WINDOW_DAYS = Number(process.env.RETURN_WINDOW_DAYS) || 14;

export const PROOF_REQUIRED_REASONS = new Set([
  "damaged_item",
  "wrong_product",
  "allergic_reaction",
]);

const QUANTITY_RESERVED_STATUSES = ["pending", "approved", "picked_up", "received"];

const REFUND_STATUS_TRANSITIONS = {
  pending: ["approved", "rejected"],
  approved: ["picked_up", "rejected"],
  picked_up: ["received"],
  received: ["refunded"],
  rejected: [],
  refunded: [],
};

const CARD_PROVIDERS = ["stripe", "paymob"];

/** True when value looks like a 24-char Mongo ObjectId. */
const isMongoObjectId = (id) =>
  mongoose.Types.ObjectId.isValid(String(id ?? "")) && String(id).length === 24;

// --- order line helpers ---

/** Stable key for an order line (item _id or idx:n fallback). */
const getOrderLineKey = (item, index) => (item?._id ? String(item._id) : `idx:${index}`);

/** Resolve an order line by ObjectId or idx:N / N reference. */
const resolveOrderLine = (order, orderItemId) => {
  const sid = String(orderItemId ?? "").trim();
  let line = order.items.find((i) => i._id && String(i._id) === sid);
  if (line) return line;

  const indexMatch = sid.match(/^(?:idx:)?(\d+)$/);
  if (indexMatch) {
    const idx = Number(indexMatch[1]);
    if (Number.isInteger(idx) && order.items[idx]) return order.items[idx];
  }

  return null;
};

// --- eligibility ---

/** Compute the return-window end date from deliveredAt. */
const getReturnWindowEnd = (deliveredAt) => {
  const end = new Date(deliveredAt);
  end.setDate(end.getDate() + RETURN_WINDOW_DAYS);
  return end;
};

/** Throw if the order is outside the return eligibility rules. */
const assertOrderReturnEligible = (order) => {
  if (!order) throw new ApiError("Order not found", 404);

  if (!["delivered", "partially_returned"].includes(order.orderStatus)) {
    throw new ApiError("Only delivered or partially returned orders are eligible for returns", 400);
  }

  if (!order.deliveredAt) {
    throw new ApiError("Order has no delivery date; cannot start return window", 400);
  }

  if (new Date() > getReturnWindowEnd(order.deliveredAt)) {
    throw new ApiError(`Return window expired (${RETURN_WINDOW_DAYS} days after delivery)`, 400);
  }

  if (order.paymentStatus === "refunded") {
    throw new ApiError("Order has already been fully refunded", 409);
  }
};

/** Map order-line keys → remaining returnable quantities. */
const buildReturnableMapForOrder = (order, returns = []) => {
  const reservedByItem = new Map();
  for (const ret of returns) {
    for (const line of ret.items) {
      const key = String(line.orderItemId);
      reservedByItem.set(key, (reservedByItem.get(key) || 0) + line.quantity);
    }
  }

  const map = {};
  order.items.forEach((item, index) => {
    const id = getOrderLineKey(item, index);
    const reserved = reservedByItem.get(id) || reservedByItem.get(String(item._id)) || 0;
    map[id] = Math.max(0, item.quantity - reserved);
  });
  return map;
};

/** Batch-compute returnable quantities for many orders. */
const computeReturnableQuantitiesBatch = async (orders) => {
  const list = orders?.filter(Boolean) ?? [];
  if (!list.length) return new Map();

  const orderIds = list.map((o) => o._id);
  const returns = await ReturnRequest.find({
    order: { $in: orderIds },
    refundStatus: { $in: QUANTITY_RESERVED_STATUSES },
  }).lean();

  const returnsByOrder = new Map();
  for (const ret of returns) {
    const key = String(ret.order);
    if (!returnsByOrder.has(key)) returnsByOrder.set(key, []);
    returnsByOrder.get(key).push(ret);
  }

  const result = new Map();
  for (const order of list) {
    result.set(String(order._id), buildReturnableMapForOrder(order, returnsByOrder.get(String(order._id)) ?? []));
  }
  return result;
};

/** Compute returnable quantities for a single order. */
const computeReturnableQuantities = async (orderId, orderDoc = null) => {
  const order = orderDoc ?? (await Order.findById(orderId).lean());
  if (!order) return null;

  const returns = await ReturnRequest.find({
    order: orderId,
    refundStatus: { $in: QUANTITY_RESERVED_STATUSES },
  }).lean();

  return buildReturnableMapForOrder(order, returns);
};

/** Pro-rate refund amount from returned lines against order totals. */
const calculateRefundAmount = (order, returnItems) => {
  const lineSubtotal = returnItems.reduce((sum, i) => sum + i.price * i.quantity, 0);
  if (!order.subtotal || order.subtotal <= 0) {
    return Math.round(lineSubtotal * 100) / 100;
  }
  const ratio = order.totalPrice / order.subtotal;
  return Math.max(0, Math.round(lineSubtotal * ratio * 100) / 100);
};

/** Validate requested lines and build ReturnRequest items payload. */
const buildReturnItems = async (order, requestedItems) => {
  const returnable = await computeReturnableQuantities(order._id, order);
  const built = [];

  for (const req of requestedItems) {
    const orderItemId = String(req.orderItemId).trim();
    const qty = Number(req.quantity);
    if (!Number.isFinite(qty) || qty < 1) {
      throw new ApiError("Each return item must have quantity at least 1", 400);
    }

    const orderLine = resolveOrderLine(order, orderItemId);
    if (!orderLine) {
      throw new ApiError(`No order line found with id: ${orderItemId}`, 400);
    }

    const lineIndex = order.items.findIndex((i) => i === orderLine);
    const lineKey = lineIndex >= 0 ? getOrderLineKey(orderLine, lineIndex) : orderItemId;
    const available = returnable[lineKey] ?? returnable[orderItemId] ?? 0;
    if (qty > available) {
      throw new ApiError(
        `Return quantity exceeds returnable amount for "${orderLine.name}" (max ${available})`,
        400
      );
    }

    built.push({
      orderItemId: orderLine._id || lineKey,
      product: orderLine.product,
      name: orderLine.name,
      price: orderLine.price,
      quantity: qty,
    });
  }

  return built;
};

/** Shape an order + returnable map for the eligible-orders API. */
const formatEligibleOrder = (order, returnable) => {
  const deliveredAt = order.deliveredAt ? new Date(order.deliveredAt) : null;
  const daysSinceDelivery = deliveredAt ? Math.floor((Date.now() - deliveredAt.getTime()) / 86400000) : 0;

  const items = order.items.map((item, index) => {
    const lineKey = getOrderLineKey(item, index);
    return {
      orderItemId: lineKey,
      product: item.product,
      name: item.name,
      image: item.image,
      price: item.price,
      quantity: item.quantity,
      purchasedQuantity: item.quantity,
      returnableQuantity: returnable[lineKey] ?? 0,
    };
  });

  return {
    _id: String(order._id),
    orderStatus: order.orderStatus,
    deliveredAt: order.deliveredAt,
    daysSinceDelivery,
    totalPrice: order.totalPrice,
    paymentMethod: order.paymentMethod,
    items: items.filter((i) => i.returnableQuantity > 0),
  };
};

/** Parse JSON-string items/pickupAddress fields from multipart body. */
const parseReturnCreateBody = (req) => {
  const body = { ...req.body };

  if (typeof body.items === "string") {
    try {
      body.items = JSON.parse(body.items);
    } catch {
      throw new ApiError("Invalid items JSON", 400);
    }
  }

  if (typeof body.pickupAddress === "string") {
    try {
      body.pickupAddress = JSON.parse(body.pickupAddress);
    } catch {
      throw new ApiError("Invalid pickupAddress JSON", 400);
    }
  }

  return body;
};

/** Collect uploaded proof image files from multer req.files. */
export const getReturnProofUploads = (req) => {
  if (!req.files) return [];
  if (req.files.proofImages) {
    const files = req.files.proofImages;
    return Array.isArray(files) ? files : [files];
  }
  if (Array.isArray(req.files)) {
    return req.files.filter((f) => f.fieldname === "proofImages");
  }
  return [];
};

/** Map up to 5 proof uploads into { url, publicId } records. */
const collectProofImages = (req) =>
  getReturnProofUploads(req)
    .slice(0, 5)
    .map((f) => ({ url: f.path, publicId: f.filename || null }));

/** Require proof images for damaged/wrong/allergic return reasons. */
const assertProofForReason = (reason, proofImages) => {
  if (PROOF_REQUIRED_REASONS.has(reason) && (!proofImages || proofImages.length === 0)) {
    throw new ApiError("Proof images are required for this return reason", 400);
  }
};

// --- refund-status state machine ---

/** Enforce allowed refundStatus state-machine transitions. */
const validateStatusTransition = (current, next) => {
  const allowed = REFUND_STATUS_TRANSITIONS[current];
  if (!allowed?.includes(next)) {
    throw new ApiError(`Cannot change refund status from "${current}" to "${next}"`, 400);
  }
};

/** After refunds, set order to returned/partially_returned (+ paymentStatus). */
const syncOrderReturnState = async (orderId, session) => {
  const order = await Order.findById(orderId).session(session);
  if (!order) return;

  const orderItemIds = order.items.map((i) => String(i._id));
  const orderedQty = Object.fromEntries(order.items.map((i) => [String(i._id), i.quantity]));

  const refundedReturns = await ReturnRequest.find({ order: orderId, refundStatus: "refunded" }).session(
    session
  );

  const returnedQty = {};
  for (const id of orderItemIds) returnedQty[id] = 0;

  for (const ret of refundedReturns) {
    for (const line of ret.items) {
      const key = String(line.orderItemId);
      returnedQty[key] = (returnedQty[key] || 0) + line.quantity;
    }
  }

  const allFullyReturned = orderItemIds.every((id) => (returnedQty[id] || 0) >= orderedQty[id]);
  const totalRefunded = refundedReturns.reduce((s, r) => s + (r.refundAmount || 0), 0);
  const updates = {};

  updates.orderStatus = allFullyReturned ? "returned" : "partially_returned";

  if (totalRefunded >= order.totalPrice - 0.01) {
    updates.paymentStatus = "refunded";
  }

  await Order.findByIdAndUpdate(orderId, { $set: updates }, { session, runValidators: true });
};

// --- approval / logistics validation ---

/** Validate and resolve Bosta/internal logistics fields on approve. */
const resolveLogisticsOnApprove = async (extras) => {
  const { logisticsHandler, carrierId, dropOffPickupId } = extras;

  if (!logisticsHandler || !["bosta", "internal"].includes(logisticsHandler)) {
    throw new ApiError("logisticsHandler must be bosta or internal when approving", 400);
  }

  if (logisticsHandler === "internal") {
    return { logisticsHandler: "internal", carrier: null, dropOffPickup: null, dropOffSnapshot: null };
  }

  if (!carrierId || !mongoose.Types.ObjectId.isValid(carrierId)) {
    throw new ApiError("carrierId is required when logisticsHandler is bosta", 400);
  }

  if (!dropOffPickupId || !mongoose.Types.ObjectId.isValid(dropOffPickupId)) {
    throw new ApiError("dropOffPickupId is required when logisticsHandler is bosta", 400);
  }

  const carrier = await Carrier.findById(carrierId);
  if (!carrier?.isActive || carrier.apiProvider !== "bosta" || carrier.type !== "api") {
    throw new ApiError("Invalid Bosta carrier for return drop-off", 400);
  }

  const pickup = await CarrierPickup.findOne({ _id: dropOffPickupId, carrier: carrier._id });
  if (!pickup) {
    throw new ApiError("Drop-off pickup location not found for this carrier", 404);
  }

  return {
    logisticsHandler: "bosta",
    carrier: carrier._id,
    dropOffPickup: pickup._id,
    dropOffSnapshot: {
      locationName: pickup.locationName,
      bostaLocationId: pickup.bostaLocationId,
      address: pickup.address,
    },
  };
};

/** Rematch return.pickupAddress zone refs after a zone wipe+resync (single-owner wrapper). */
const healReturnPickupAddress = async (returnRequest, { save = true } = {}) => {
  const pa = returnRequest?.pickupAddress;
  if (!pa) return { healed: false, returnRequest };

  const resolved = await resolveZoneRefs(
    {
      governorateId: pa.governorateId,
      districtId: pa.districtId,
      governorateName: pa.governorateName || pa.city,
      districtName: pa.districtName,
      isOther: !pa.districtId || String(pa.districtName || "").trim().toLowerCase() === "other",
    },
    { soft: true }
  );

  if (!resolved.ok) {
    throw new ApiError(
      `Return pickup zone could not be rematched (${pa.governorateName} / ${pa.districtName})`,
      400
    );
  }

  if (!resolved.healed) return { healed: false, returnRequest };

  pa.governorateId = resolved.governorateId;
  pa.districtId = resolved.districtId;
  if (resolved.governorateName) {
    pa.governorateName = resolved.governorateName;
    pa.city = resolved.governorateName;
  }
  if (resolved.districtName) pa.districtName = resolved.districtName;

  // Force rebuild of Bosta string ids from current zone mapping
  pa.cityId = null;
  pa.zoneId = null;
  pa.bostaDistrictId = null;

  if (save && typeof returnRequest.save === "function") await returnRequest.save();
  return { healed: true, returnRequest };
};

// --- Bosta return-delivery scheduling ---

/** Build Bosta drop-off from warehouse CarrierPickup (location id or address). */
const buildReturnDropOffFromPickupDoc = (pickupDoc) => {
  if (pickupDoc.bostaLocationId) {
    return { businessLocationId: pickupDoc.bostaLocationId };
  }
  const addr = pickupDocToBostaAddress(pickupDoc);
  if (!addr) {
    throw new ApiError("Drop-off location is missing Bosta address data", 400);
  }
  return { dropOffAddress: applyBostaAddressDefaults(addr) };
};

/** Map Oxxila's customer pickup address (on the return) → Bosta IDs (never use Mongo districtId as Bosta id). */
const resolveReturnPickupBostaAddress = async (pickupAddress, carrierId, credentials) => {
  const pa = pickupAddress ?? {};
  const isOther =
    !pa.districtId || pa.districtName === "Other" || String(pa.districtId).toLowerCase() === "other";

  if (pa.bostaDistrictId && pa.cityId) {
    const ready = applyBostaAddressDefaults(
      buildBostaAddress({
        city: pa.governorateName || pa.city,
        cityId: pa.cityId,
        zoneId: pa.zoneId,
        districtId: pa.bostaDistrictId,
        firstLine: pa.firstLine,
        secondLine: pa.secondLine,
      })
    );
    assertDropOffAddressReady(ready);
    return ready;
  }

  if (carrierId) {
    const mapping = await getCarrierZoneMapping(carrierId, {
      governorateId: pa.governorateId,
      districtId: isOther || !isMongoObjectId(pa.districtId) ? null : pa.districtId,
    });

    const fromMapping = buildDropOffFromMapping(
      {
        governorateName: pa.governorateName || pa.city,
        districtName: pa.districtName || pa.city,
        addressLine: pa.firstLine,
        isOther,
      },
      mapping
    );

    if (fromMapping) {
      if (pa.secondLine?.trim() && !fromMapping.secondLine) {
        fromMapping.secondLine = pa.secondLine.trim();
      }
      assertDropOffAddressReady(fromMapping);
      return fromMapping;
    }
  }

  const enriched = await enrichBostaAddress(
    buildBostaAddress({
      city: pa.governorateName || pa.city,
      firstLine: pa.firstLine,
      secondLine: pa.secondLine,
      districtName: pa.districtName,
    }),
    credentials,
    { cityName: pa.governorateName || pa.city, districtName: pa.districtName }
  );

  assertDropOffAddressReady(enriched);
  return enriched;
};

/** POST a Bosta return (type 25) pickup — reuses the same body builder as outbound deliveries. */
const createBostaReturnDelivery = async (params, credentials) => {
  const body = buildBostaDeliveryBody({
    type: BOSTA_DELIVERY_TYPE_RETURN,
    packageSpecs: params.packageSpecs,
    receiverName: params.receiverName,
    receiverPhone: params.receiverPhone,
    receiverEmail: params.receiverEmail,
    cod: 0,
    businessReference: params.businessReference,
    uniqueBusinessReference: params.uniqueBusinessReference,
    notes: params.notes,
    allowToOpenPackage: params.allowToOpenPackage,
    businessLocationId: params.businessLocationId,
    dropOffAddress: params.dropOffAddress,
    pickupAddress: params.pickupAddress,
  });

  if (!body.businessLocationId && !body.dropOffAddress) {
    throw new ApiError("Drop-off location is required for Bosta return", 400);
  }

  return postBostaDelivery(body, credentials);
};

/** Create (or reuse) a Bosta return delivery for a ReturnRequest. */
const createBostaReturnForReturnRequest = async (returnRequest, order) => {
  if (returnRequest.logisticsHandler !== "bosta") {
    throw new ApiError("Return is not assigned to Bosta logistics", 400);
  }

  if (returnRequest.bostaExternalId) {
    return {
      trackingNumber: returnRequest.bostaTrackingNumber,
      externalDeliveryId: returnRequest.bostaExternalId,
      alreadyScheduled: true,
    };
  }

  const carrierId = returnRequest.carrier;
  const credentials = await getBostaCredentials(carrierId);
  if (!credentials?.apiKey) {
    throw new ApiError("Bosta carrier is not configured", 503);
  }

  const pickupDoc = await CarrierPickup.findById(returnRequest.dropOffPickup);
  if (!pickupDoc) {
    throw new ApiError("Drop-off pickup location not found", 404);
  }

  const dropOff = buildReturnDropOffFromPickupDoc(pickupDoc);

  const user = await User.findById(returnRequest.user).select("name phone email");
  if (!user?.phone) {
    throw new ApiError("Customer phone is required for Bosta return pickup", 400);
  }

  let customerPickup;
  try {
    await healReturnPickupAddress(returnRequest, { save: true });
    customerPickup = await resolveReturnPickupBostaAddress(returnRequest.pickupAddress, carrierId, credentials);
  } catch (err) {
    if (err instanceof ApiError) throw err;
    if (isUncoveredAddressError(err)) {
      throw new ApiError(
        `${formatBostaError(err)} — Use a Bosta-covered district for customer pickup address.`,
        400
      );
    }
    throw err;
  }

  const itemsDesc =
    returnRequest.items.map((i) => `${i.name} x${i.quantity}`).join(", ").slice(0, 500) ||
    `Return ${returnRequest._id}`;

  const warehouseContact = pickupDoc.contactPerson;
  let apiRes;
  try {
    apiRes = await createBostaReturnDelivery(
      {
        receiverName: warehouseContact?.name || "Oxxila Warehouse",
        receiverPhone: normalizeEgyptPhone(warehouseContact?.phone || user.phone),
        receiverEmail: warehouseContact?.email || undefined,
        pickupAddress: customerPickup,
        ...dropOff,
        businessReference: `RT-${returnRequest._id}`,
        uniqueBusinessReference: `RT-${returnRequest._id}`,
        notes: returnRequest.logisticsNotes?.trim() || `Return ${returnRequest._id} | Order ${order._id}`,
        allowToOpenPackage: true,
        packageSpecs: {
          itemsCount: returnRequest.items.reduce((s, i) => s + i.quantity, 0),
          description: itemsDesc,
        },
      },
      credentials
    );
  } catch (err) {
    if (isUncoveredAddressError(err)) {
      throw new ApiError(`${formatBostaError(err)} — Check zones and drop-off location.`, 400);
    }
    throw err;
  }

  const normalized = normalizeBostaDeliveryApiResult(apiRes);
  if (!normalized) {
    throw new ApiError("Bosta returned an empty delivery response", 502);
  }
  return { ...normalized, alreadyScheduled: false };
};

const RETURN_PHASE_TO_REFUND_STATUS = {
  handed_over: "picked_up", // Bosta picked the item up from the customer
  delivered: "received", // Bosta delivered the item back to our warehouse
};

/**
 * Advance ReturnRequest.bostaState / refundStatus from a Bosta delivery webhook.
 * Exported for orderShipping.controller.js's shared webhook dispatcher to call.
 */
export const handleBostaReturnWebhook = async (parsed) => {
  const ref = String(parsed.businessReference || "");
  if (!ref.startsWith("RT-")) return null;

  const returnId = ref.slice(3);
  if (!returnId) return { handled: false, reason: "invalid_return_reference" };

  const doc = await ReturnRequest.findById(returnId);
  if (!doc) return { handled: false, reason: "return_not_found", returnId };

  const stateParts = parseBostaStateParts(parsed.state);
  const updates = {
    bostaState: stateParts.code ?? stateParts.label,
    bostaStateLabel: stateParts.label,
  };
  if (parsed.trackingNumber && !doc.bostaTrackingNumber) {
    updates.bostaTrackingNumber = parsed.trackingNumber;
  }
  if (parsed.deliveryId && !doc.bostaExternalId) {
    updates.bostaExternalId = String(parsed.deliveryId);
  }

  const nextRefundStatus = RETURN_PHASE_TO_REFUND_STATUS[mapBostaStateToPhase(parsed.state)];
  if (nextRefundStatus && REFUND_STATUS_TRANSITIONS[doc.refundStatus]?.includes(nextRefundStatus)) {
    updates.refundStatus = nextRefundStatus;
  }

  const updated = await ReturnRequest.findByIdAndUpdate(returnId, { $set: updates }, {
    returnDocument: "after",
    runValidators: true,
  });

  return { handled: true, kind: "return", returnRequest: updated };
};

// --- store credit ---

/** Round a money amount to 2 decimal places. */
const roundMoney = (n) => Math.round(n * 100) / 100;

/** Issue store credit for a COD return (idempotent per returnRequest). */
const issueStoreCredit = async ({ userId, amount, returnRequestId, session }) => {
  const rounded = roundMoney(amount);
  if (rounded <= 0) {
    throw new ApiError("Store credit amount must be greater than zero", 400);
  }

  const existing = await StoreCreditTransaction.findOne({ returnRequest: returnRequestId, type: "issued" })
    .session(session ?? null)
    .lean();

  if (existing) {
    return { alreadyIssued: true, balanceAfter: existing.balanceAfter };
  }

  const user = await User.findByIdAndUpdate(
    userId,
    { $inc: { storeCreditBalance: rounded } },
    { new: true, session, runValidators: true }
  );

  if (!user) {
    throw new ApiError(`No user found with id: ${userId}`, 404);
  }

  const balanceAfter = roundMoney(user.storeCreditBalance);

  await StoreCreditTransaction.create(
    [{ user: userId, type: "issued", amount: rounded, returnRequest: returnRequestId, balanceAfter }],
    { session }
  );

  return { alreadyIssued: false, balanceAfter };
};

// --- refund finalization ---

/** Restock, refund via gateway or store credit, and mark return refunded. */
const finalizeReturnRefund = async (returnRequest, order) => {
  if (returnRequest.restocked) {
    return {
      returnRequest,
      gatewayRefundId: returnRequest.gatewayRefundId,
      alreadyDone: true,
      storeCreditIssued: false,
    };
  }

  const alreadyRefunded = await ReturnRequest.aggregate([
    { $match: { order: order._id, refundStatus: "refunded", _id: { $ne: returnRequest._id } } },
    { $group: { _id: null, total: { $sum: "$refundAmount" } } },
  ]);
  const priorTotal = alreadyRefunded[0]?.total ?? 0;
  const cap = Math.max(0, order.totalPrice - priorTotal);

  if (returnRequest.refundAmount > cap + 0.01) {
    throw new ApiError(`Refund amount exceeds remaining refundable balance (${cap} EGP)`, 400);
  }

  let gatewayRefundId = returnRequest.gatewayRefundId;

  if (order.paymentMethod === "card" && order.paymentStatus === "paid" && CARD_PROVIDERS.includes(order.paymentProvider)) {
    if (!order.paymentReference) {
      throw new ApiError("Order has no payment reference for refund", 400);
    }

    const { createStripeRefund, resolveStripePaymentIntentId, createPaymobRefund } = await import(
      "./payment.controller.js"
    );

    const amountCents = toMinorUnits(returnRequest.refundAmount);

    if (order.paymentProvider === "stripe") {
      const paymentIntentId = await resolveStripePaymentIntentId(order.paymentReference);
      const refund = await createStripeRefund({ paymentIntentId, amount: amountCents });
      gatewayRefundId = refund.id;
    } else if (order.paymentProvider === "paymob") {
      const refund = await createPaymobRefund({ transactionId: order.paymentReference, amountCents });
      gatewayRefundId = String(refund.id ?? refund.transaction_id ?? "");
    } else {
      throw new ApiError("Unsupported payment provider for return refund", 400);
    }
  }

  const session = await mongoose.startSession();
  let updated;
  let storeCreditIssued = false;

  try {
    await session.withTransaction(async () => {
      if (order.paymentMethod === "cod") {
        const creditResult = await issueStoreCredit({
          userId: returnRequest.user,
          amount: returnRequest.refundAmount,
          returnRequestId: returnRequest._id,
          session,
        });
        storeCreditIssued = !creditResult.alreadyIssued;
      }

      await restoreStockForOrderItems(returnRequest.items, session);

      updated = await ReturnRequest.findByIdAndUpdate(
        returnRequest._id,
        {
          refundStatus: "refunded",
          restocked: true,
          refundedAt: new Date(),
          gatewayRefundId: gatewayRefundId ?? null,
        },
        { new: true, session, runValidators: true }
      );

      await syncOrderReturnState(order._id, session);
    });
  } finally {
    session.endSession();
  }

  return { returnRequest: updated, gatewayRefundId, alreadyDone: false, storeCreditIssued };
};

// --- route handlers ---

/** Find a return request owned by the given user. */
const findUserReturn = (id, userId) => ReturnRequest.findOne({ _id: id, user: userId });

/**
 * @desc    List the current user's orders eligible for return
 * @route   GET /api/v1/returns/eligible-orders
 * @access  Private
 */
export const getEligibleReturnOrders = asyncHandler(async (req, res) => {
  const windowCutoff = new Date();
  windowCutoff.setDate(windowCutoff.getDate() - RETURN_WINDOW_DAYS);

  const mongoFilter = {
    user: req.user._id,
    orderStatus: { $in: ["delivered", "partially_returned"] },
    deliveredAt: { $ne: null, $gte: windowCutoff },
    paymentStatus: { $ne: "refunded" },
  };

  const features = new ApiFeatures(
    Order.find(mongoFilter).select("orderStatus deliveredAt totalPrice paymentMethod paymentStatus items"),
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
    message: "Eligible return orders retrieved successfully",
    data: eligible,
    pagination: { ...features.getPaginationResult(), results: eligible.length },
  });
});

/**
 * @desc    Create a return request for the current user's order
 * @route   POST /api/v1/returns
 * @access  Private
 */
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
    note: body.note?.trim() || "",
    proofImages,
    pickupAddress: body.pickupAddress,
    contactPhone: body.contactPhone?.trim() || req.user.phone || null,
    refundAmount,
    refundStatus: "pending",
  });

  const populated = await ReturnRequest.findById(doc._id).populate(returnPopulate).lean();

  sendResponse(res, { statusCode: 201, message: "Return request created successfully", data: populated });
});

/**
 * @desc    List the current user's return requests
 * @route   GET /api/v1/returns/my-returns
 * @access  Private
 */
export const getMyReturns = asyncHandler(async (req, res) => {
  const features = new ApiFeatures(ReturnRequest.find({ user: req.user._id }), req.query)
    .filter()
    .sort()
    .limitFields();

  await features.paginate();

  const returns = await features.mongooseQuery.populate(returnMyListPopulate).lean();

  sendResponse(res, {
    message: "Return requests retrieved successfully",
    data: returns,
    pagination: { ...features.getPaginationResult(), results: returns.length },
  });
});

/**
 * @desc    Get one of the current user's return requests
 * @route   GET /api/v1/returns/my-returns/:id
 * @access  Private
 */
export const getMyReturn = asyncHandler(async (req, res, next) => {
  const doc = await findUserReturn(req.params.id, req.user._id).populate(returnPopulate).lean();
  if (!doc) return next(new ApiError(`No return request found with id: ${req.params.id}`, 404));

  sendResponse(res, { message: "Return request retrieved successfully", data: doc });
});

/**
 * @desc    List all return requests (admin)
 * @route   GET /api/v1/returns
 * @access  Admin
 */
export const getReturns = asyncHandler(async (req, res) => {
  const features = new ApiFeatures(ReturnRequest.find(), req.query).filter().sort().limitFields();

  await features.paginate();

  const returns = await features.mongooseQuery.populate(returnListPopulate).lean();

  sendResponse(res, {
    message: "Return requests retrieved successfully",
    data: returns,
    pagination: { ...features.getPaginationResult(), results: returns.length },
  });
});

/**
 * @desc    Get a return request by id (admin)
 * @route   GET /api/v1/returns/:id
 * @access  Admin
 */
export const getReturn = asyncHandler(async (req, res, next) => {
  const doc = await ReturnRequest.findById(req.params.id).populate(returnAdminDetailPopulate).lean();

  if (!doc) return next(new ApiError(`No return request found with id: ${req.params.id}`, 404));

  sendResponse(res, { message: "Return request retrieved successfully", data: doc });
});

/**
 * @desc    Update return refundStatus (approve/reject/receive/refund)
 * @route   PATCH /api/v1/returns/:id/status
 * @access  Admin
 */
export const updateReturnStatus = asyncHandler(async (req, res, next) => {
  const doc = await ReturnRequest.findById(req.params.id);
  if (!doc) return next(new ApiError(`No return request found with id: ${req.params.id}`, 404));

  const nextStatus = req.body.refundStatus;
  validateStatusTransition(doc.refundStatus, nextStatus);

  const updates = { refundStatus: nextStatus };

  if (nextStatus === "approved") {
    const logistics = await resolveLogisticsOnApprove({
      logisticsHandler: req.body.logisticsHandler,
      carrierId: req.body.carrierId,
      dropOffPickupId: req.body.dropOffPickupId,
    });
    Object.assign(updates, logistics);
  }

  if (nextStatus === "rejected") {
    updates.adminNote = req.body.adminNote?.trim() || null;
  }

  if (nextStatus === "refunded") {
    if (doc.refundStatus !== "received") {
      return next(new ApiError("Return must be received before refunding", 400));
    }

    const order = await Order.findById(doc.order);
    if (!order) return next(new ApiError("Linked order not found", 404));

    const { returnRequest, gatewayRefundId, storeCreditIssued } = await finalizeReturnRefund(doc, order);

    const populated = await ReturnRequest.findById(returnRequest._id).populate(returnPopulate).lean();

    const isCod = order.paymentMethod === "cod";
    const message = isCod
      ? "Return refunded successfully; store credit issued to customer"
      : "Return refunded successfully";

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
    returnDocument: "after",
    runValidators: true,
  })
    .populate(returnPopulate)
    .lean();

  sendResponse(res, { message: "Return status updated successfully", data: updated });
});

/**
 * @desc    Schedule a Bosta customer-return pickup for an approved return
 * @route   POST /api/v1/returns/:id/bosta/schedule
 * @access  Admin
 */
export const scheduleBostaReturn = asyncHandler(async (req, res, next) => {
  const doc = await ReturnRequest.findById(req.params.id);
  if (!doc) return next(new ApiError(`No return request found with id: ${req.params.id}`, 404));

  if (doc.logisticsHandler !== "bosta") {
    return next(new ApiError("Return logistics handler is not Bosta", 400));
  }

  if (!["approved", "picked_up"].includes(doc.refundStatus)) {
    return next(new ApiError("Bosta return can only be scheduled after approval", 400));
  }

  const order = await Order.findById(doc.order);
  if (!order) return next(new ApiError("Linked order not found", 404));

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
    { returnDocument: "after", runValidators: true }
  ).populate(returnPopulate);

  sendResponse(res, {
    message: result.alreadyScheduled ? "Bosta return was already scheduled" : "Bosta return scheduled successfully",
    data: { returnRequest: updated, ...result },
  });
});
