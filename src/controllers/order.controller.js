// src/controllers/order.controller.js
import asyncHandler from 'express-async-handler';
import mongoose from 'mongoose';
import Cart from '../models/Cart.js';
import Coupon from '../models/Coupon.js';
import Country from '../models/Country.js';
import Governorate from '../models/Governorate.js';
import District from '../models/District.js';
import Order from '../models/Order.js';
import Product from '../models/Product.js';
import Shipment from '../models/Shipment.js';
import Carrier from '../models/Carrier.js';
import User from '../models/User.js';
import ReturnRequest from '../models/ReturnRequest.js';
import StoreCreditTransaction from '../models/StoreCreditTransaction.js';
import PaymentGateway from '../models/PaymentGateway.js';
import ApiError from '../utils/apiError.js';
import ApiFeatures from '../utils/apiFeatures.js';
import sendResponse from '../utils/apiResponse.js';
import sendEmail from '../utils/email.js';
import orderConfirmationTemplate from '../utils/emailTemplates/orderConfirmationTemplate.js';
import logger from '../config/logger.js';
import { refreshProductOffers, resolveProductPrice } from '../utils/productOffer.js';
import { mapBostaStateToPhase, normalizeBostaState, loadShipmentsForOrders } from './orderShipping.controller.js';
import {
  buildOrderDeliveryEstimate,
  isCommittedCarrierAssignment,
} from '../utils/orderDeliveryEstimate.js';
import {
  buildFieldChange,
  buildAuditBlock,
  enrichDocsWithAudit,
  recordAdminActivity,
  withOrderAuditPopulate,
} from '../utils/adminActivity.js';
import { buildOrderActivityLabel } from '../utils/adminActivityLabels.js';

// Stripe / Paymob card gateways eligible for refund flows
const CARD_PROVIDERS = new Set(['stripe', 'paymob']);
// Statuses from which the buyer may cancel their own order
const USER_CANCELLABLE_STATUSES = new Set(['pending', 'processing']);
// Statuses that block admin cancel
const ADMIN_BLOCKED_CANCEL_STATUSES = new Set(['delivered', 'cancelled']);
// Default projection for paginated order lists (avoids shipping heavy item payloads)
const ORDER_LIST_SELECT =
  'user customerName shippingAddress shipping subtotal shippingPrice discountAmount totalPrice couponCode paymentMethod paymentProvider paymentStatus orderStatus deliveredAt cancelledAt cancellationReason cancelledBy createdAt updatedAt';

/** Convert major currency units to minor (cents) for payment gateways. */
export const toMinorUnits = (amount) => Math.round(amount * 100);
/** Round to 2 decimal places for money math. */
const roundMoney = (n) => Math.round(n * 100) / 100;

// ── Zone resolution ──

/** Normalize a zone/address label for fuzzy matching. */
const normalizeLabel = (value) => String(value || '').trim().toLowerCase();

/** Escape a string for safe use inside a RegExp. */
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** True when value looks like a Mongo ObjectId and is not the sentinel "other". */
const isValidZoneObjectId = (value) =>
  Boolean(value) && mongoose.Types.ObjectId.isValid(value) && String(value).toLowerCase() !== 'other';

/** Fuzzy equality for governorate/district name labels. */
const labelsMatch = (a, b) => {
  const left = normalizeLabel(a);
  const right = normalizeLabel(b);
  if (!left || !right) return false;
  if (left === right) return true;
  if (left.length > 2 && right.length > 2) {
    return left.includes(right) || right.includes(left);
  }
  return false;
};

/** Find an active governorate by name, optionally scoped to a country. */
const findGovernorateByName = async ({ governorateName, countryId, countryName }) => {
  const name = normalizeLabel(governorateName);
  if (!name) return null;

  let countryFilter = null;
  if (isValidZoneObjectId(countryId)) {
    countryFilter = countryId;
  } else if (countryName) {
    const country = await Country.findOne({
      $or: [
        { name: new RegExp(`^${escapeRegex(String(countryName).trim())}$`, 'i') },
        { code: String(countryName).trim().toUpperCase() },
      ],
    }).select('_id');
    if (country) countryFilter = country._id;
  }

  const query = { isActive: true };
  if (countryFilter) query.country = countryFilter;

  const candidates = await Governorate.find(query).select('_id name country isActive').lean();
  return (
    candidates.find((g) => labelsMatch(g.name, governorateName)) ||
    (await Governorate.find({ isActive: { $ne: false } })
      .select('_id name country isActive')
      .lean()
      .then((all) => all.find((g) => labelsMatch(g.name, governorateName)))) ||
    null
  );
};

/** Find a district under a governorate by fuzzy name match. */
const findDistrictByName = async (governorateId, districtName) => {
  if (!governorateId || !normalizeLabel(districtName)) return null;
  if (normalizeLabel(districtName) === 'other') return null;

  const districts = await District.find({ governorate: governorateId }).select('_id name governorate').lean();
  return districts.find((d) => labelsMatch(d.name, districtName)) || null;
};

/**
 * Resolve / rematch zone ObjectIds using stored names when IDs are stale after a wipe+sync.
 * @param {{ soft?: boolean }} options - soft: return unresolved instead of throwing
 */
export const resolveZoneRefs = async (
  {
    governorateId = null,
    districtId = null,
    countryId = null,
    governorateName = null,
    districtName = null,
    countryName = null,
    isOther = false,
  } = {},
  { soft = false } = {}
) => {
  const wantOther =
    isOther ||
    !districtId ||
    String(districtId).toLowerCase() === 'other' ||
    normalizeLabel(districtName) === 'other';

  let gov = isValidZoneObjectId(governorateId)
    ? await Governorate.findById(governorateId).select('_id name country isActive').lean()
    : null;

  let district = null;
  if (!wantOther && isValidZoneObjectId(districtId)) {
    district = await District.findById(districtId).select('_id name governorate').lean();
    if (district && gov && String(district.governorate) !== String(gov._id)) {
      district = null;
    }
  }

  let healed = false;

  if (!gov?.isActive) {
    gov = await findGovernorateByName({ governorateName, countryId, countryName });
    if (!gov) {
      if (soft) {
        return { ok: false, healed: false, unresolved: true, countryId: null, governorateId: null, districtId: null };
      }
      throw new ApiError(
        governorateName
          ? `Governorate "${governorateName}" could not be resolved after zone sync`
          : 'Governorate not found',
        404
      );
    }
    healed = true;
    // Old district ObjectId (if any) belonged to a different gov tree — rematch by name.
    district = null;
  }

  if (wantOther) {
    const resolvedCountryId = countryId && isValidZoneObjectId(countryId) ? countryId : gov.country;
    return {
      ok: true,
      healed,
      unresolved: false,
      countryId: resolvedCountryId,
      governorateId: gov._id,
      districtId: null,
      governorateName: gov.name,
      districtName: districtName || 'Other',
      isOther: true,
    };
  }

  if (!district) {
    district = await findDistrictByName(gov._id, districtName);
    if (!district) {
      if (soft) {
        return {
          ok: false,
          healed: true,
          unresolved: true,
          countryId: gov.country,
          governorateId: gov._id,
          districtId: null,
          governorateName: gov.name,
          districtName,
          isOther: true,
        };
      }
      throw new ApiError(
        districtName
          ? `District "${districtName}" could not be resolved in ${gov.name} after zone sync`
          : 'District not found',
        404
      );
    }
    healed = true;
  }

  return {
    ok: true,
    healed,
    unresolved: false,
    countryId: gov.country,
    governorateId: gov._id,
    districtId: district._id,
    governorateName: gov.name,
    districtName: district.name,
    isOther: false,
  };
};

/** Rematch a User.addresses entry's zone refs. Exported for userProfile.controller.js. */
export const healUserAddressEntry = async (entry, { soft = true } = {}) => {
  const resolved = await resolveZoneRefs(
    {
      governorateId: entry.governorate?.id,
      districtId: entry.isOther ? 'other' : entry.district?.id,
      governorateName: entry.governorate?.name,
      districtName: entry.district?.name,
      isOther: entry.isOther,
    },
    { soft }
  );

  if (!resolved.ok) return { healed: false, unresolved: true, entry };
  if (!resolved.healed) return { healed: false, unresolved: false, entry };

  entry.governorate = { id: resolved.governorateId, name: resolved.governorateName || entry.governorate?.name };
  entry.isOther = resolved.isOther;
  entry.district = resolved.isOther
    ? null
    : { id: resolved.districtId, name: resolved.districtName || entry.district?.name };

  return { healed: true, unresolved: false, entry };
};

/** Batch-remap User addresses, Order.shippingAddress, and ReturnRequest.pickupAddress after a zone sync. */
export const remapAllZoneRefsAfterSync = async () => {
  const stats = {
    addressesRemapped: 0,
    addressesUnresolved: 0,
    ordersRemapped: 0,
    ordersUnresolved: 0,
    returnsRemapped: 0,
    returnsUnresolved: 0,
  };

  const users = await User.find({ 'addresses.0': { $exists: true } }).select('addresses');
  for (const user of users) {
    let dirty = false;
    for (const entry of user.addresses) {
      const result = await healUserAddressEntry(entry, { soft: true });
      if (result.healed) {
        stats.addressesRemapped += 1;
        dirty = true;
      } else if (result.unresolved) {
        stats.addressesUnresolved += 1;
      }
    }
    if (dirty) await user.save();
  }

  const orders = await Order.find({}).select('shippingAddress');
  for (const order of orders) {
    const sa = order.shippingAddress;
    if (!sa) continue;
    const resolved = await resolveZoneRefs(
      {
        governorateId: sa.governorateId,
        districtId: sa.districtId,
        countryId: sa.countryId,
        governorateName: sa.governorateName,
        districtName: sa.districtName,
        countryName: sa.countryName,
        isOther: sa.isOther,
      },
      { soft: true }
    );

    if (!resolved.ok) {
      stats.ordersUnresolved += 1;
      continue;
    }
    if (!resolved.healed) continue;

    sa.countryId = resolved.countryId;
    sa.governorateId = resolved.governorateId;
    sa.districtId = resolved.districtId;
    sa.isOther = resolved.isOther;
    if (resolved.governorateName) sa.governorateName = resolved.governorateName;
    if (resolved.districtName) sa.districtName = resolved.districtName;
    await order.save();
    stats.ordersRemapped += 1;
  }

  const returns = await ReturnRequest.find({ 'pickupAddress.firstLine': { $exists: true } }).select(
    'pickupAddress'
  );
  for (const doc of returns) {
    const pa = doc.pickupAddress;
    if (!pa) continue;
    const resolved = await resolveZoneRefs(
      {
        governorateId: pa.governorateId,
        districtId: pa.districtId,
        governorateName: pa.governorateName || pa.city,
        districtName: pa.districtName,
        isOther: !pa.districtId || normalizeLabel(pa.districtName) === 'other',
      },
      { soft: true }
    );

    if (!resolved.ok) {
      stats.returnsUnresolved += 1;
      continue;
    }
    if (!resolved.healed) continue;

    pa.governorateId = resolved.governorateId;
    pa.districtId = resolved.districtId;
    if (resolved.governorateName) {
      pa.governorateName = resolved.governorateName;
      pa.city = resolved.governorateName;
    }
    if (resolved.districtName) pa.districtName = resolved.districtName;
    pa.cityId = null;
    pa.zoneId = null;
    pa.bostaDistrictId = null;
    await doc.save();
    stats.returnsRemapped += 1;
  }

  return stats;
};

// ── Shipping price resolution ──

/**
 * Resolve checkout shipping price from governorate + optional district (by id).
 * Falls back to governorate price when district is missing, "other", or not covered.
 * Exported for shipping.controller.js's public price-lookup endpoint.
 */
export const resolveShipping = async ({ governorateId, districtId }) => {
  const governorate = await Governorate.findById(governorateId);
  if (!governorate || !governorate.isActive) {
    throw new ApiError('Governorate not found', 404);
  }

  if (!districtId || districtId === 'other') {
    return { shippingPrice: governorate.shippingPrice, isOther: true };
  }

  const district = await District.findById(districtId);
  if (!district || !district.isCovered) {
    return { shippingPrice: governorate.shippingPrice, isOther: true };
  }

  return { shippingPrice: district.shippingPrice, isOther: false };
};

// ── Order status / tracking presentation ──

/** Human-readable labels for each Order.orderStatus value. */
export const ORDER_STATUS_LABELS = {
  pending: 'Order placed',
  confirmed: 'Confirmed',
  processing: 'Preparing shipment',
  shipped: 'On the way',
  out_for_delivery: 'Out for delivery',
  failed_attempt: 'Delivery attempt failed',
  returned: 'Returned',
  partially_returned: 'Partially returned',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

/** Map orderStatus to its display label. */
export const getOrderStatusLabel = (orderStatus) => ORDER_STATUS_LABELS[orderStatus] ?? orderStatus ?? 'Unknown';

/** Paid / Not paid (+ Refunded) — same on every order response. */
export const getPaymentStatusLabel = ({ paymentStatus }) => {
  if (paymentStatus === 'paid') return 'Paid';
  if (paymentStatus === 'refunded') return 'Refunded';
  return 'Not paid';
};

/** Whether paymentStatus means the order is paid. */
export const getIsPaid = (paymentStatus) => paymentStatus === 'paid';

/** Attach status/payment display fields used by all order API responses. */
export const buildOrderPresentation = (order) => ({
  orderStatusLabel: getOrderStatusLabel(order?.orderStatus),
  paymentStatusLabel: getPaymentStatusLabel(order),
  isPaid: getIsPaid(order?.paymentStatus),
});

/** Fixed 4-step customer tracking stepper definition. */
export const ORDER_TRACKING_STEPS = [
  { key: 'placed', label: 'Order placed', order: 1 },
  { key: 'handed_over', label: 'Picked up', order: 2 },
  { key: 'in_transit', label: 'On the way', order: 3 },
  { key: 'delivered', label: 'Delivered', order: 4 },
];

/** Map internal orderStatus onto a tracking phase key. */
const mapOrderStatusToPhase = (orderStatus) => {
  switch (orderStatus) {
    case 'pending':
    case 'confirmed':
      return 'placed';
    case 'processing':
      return 'handed_over';
    case 'shipped':
    case 'out_for_delivery':
    case 'failed_attempt':
      return 'in_transit';
    case 'returned':
      return 'cancelled';
    case 'delivered':
      return 'delivered';
    case 'cancelled':
      return 'cancelled';
    default:
      return 'placed';
  }
};

/** Prefer carrier shipment state, else fall back to orderStatus phase. */
const resolveOrderTrackingPhase = (order, shipment) => {
  const fromBosta = shipment?.providerState ? mapBostaStateToPhase(shipment.providerState) : null;
  if (fromBosta && fromBosta !== 'cancelled') return fromBosta;
  if (shipment?.status === 'delivered') return 'delivered';
  if (['in_transit', 'out_for_delivery'].includes(shipment?.status)) return 'in_transit';
  if (shipment?.status === 'picked_up' || shipment?.status === 'submitted') return 'handed_over';
  return mapOrderStatusToPhase(order?.orderStatus);
};

/** Mark each stepper step completed / active / upcoming relative to activeKey. */
const buildTrackingStepper = (steps, activeKey) => {
  const activeOrder = steps.find((s) => s.key === activeKey)?.order ?? steps[steps.length - 1].order + 1;
  return steps.map((step) => ({
    ...step,
    status: step.order < activeOrder ? 'completed' : step.order === activeOrder ? 'active' : 'upcoming',
  }));
};

/** Build the tracking object returned on every enriched order. */
export const buildOrderTrackingPayload = (order, shipment = null) => {
  const phase = resolveOrderTrackingPhase(order, shipment);
  const steps =
    phase === 'cancelled'
      ? buildTrackingStepper(ORDER_TRACKING_STEPS, 'placed').map((s) => ({ ...s, status: 'upcoming' }))
      : buildTrackingStepper(ORDER_TRACKING_STEPS, phase === 'out_for_delivery' ? 'in_transit' : phase);

  return {
    phase,
    currentStep: phase === 'out_for_delivery' ? 'in_transit' : phase,
    steps,
    trackingNumber: shipment?.trackingNumber ?? null,
    carrierName: shipment?.carrierName ?? null,
    carrierStatusLabel: shipment?.providerStateLabel ?? null,
    carrierStatusCode: normalizeBostaState(shipment?.providerState),
  };
};

/** Aggregate item counts for lean order lists that omit the items array. */
const loadOrderItemCounts = async (orderIds) => {
  if (!orderIds?.length) return new Map();

  const rows = await Order.aggregate([
    { $match: { _id: { $in: orderIds } } },
    { $project: { itemCount: { $size: '$items' } } },
  ]);

  return new Map(rows.map((r) => [String(r._id), r.itemCount]));
};

/** Load carrier deliveryDays for committed shipment assignments. */
const loadCarrierDeliveryDaysForShipments = async (shipments) => {
  const carrierIds = [
    ...new Set(
      shipments
        .filter(isCommittedCarrierAssignment)
        .map((shipment) => String(shipment.carrier))
        .filter(Boolean)
    ),
  ];
  if (!carrierIds.length) return new Map();

  const carriers = await Carrier.find({ _id: { $in: carrierIds } }).select('deliveryDays').lean();
  return new Map(carriers.map((carrier) => [String(carrier._id), carrier.deliveryDays ?? null]));
};

/** Attach presentation, shipment summary, tracking, and delivery estimate to a single order doc. */
export const enrichOrderDocument = (order, shipment = null, itemCount = null, carrierDeliveryDays = null) => {
  const doc = order?.toObject ? order.toObject() : { ...order };
  if (itemCount != null && doc.itemCount == null) {
    doc.itemCount = itemCount;
  } else if (doc.itemCount == null && Array.isArray(doc.items)) {
    doc.itemCount = doc.items.length;
  }
  const shipmentSummary = shipment
    ? {
        carrier: shipment.carrier,
        carrierName: shipment.carrierName,
        carrierCode: shipment.carrierCode,
        carrierType: shipment.carrierType,
        trackingNumber: shipment.trackingNumber,
        externalDeliveryId: shipment.externalDeliveryId,
        status: shipment.status,
        lastError: shipment.lastError,
        providerStateLabel: shipment.providerStateLabel,
        assignedAt: shipment.assignedAt ?? null,
      }
    : null;
  return {
    ...doc,
    ...buildOrderPresentation(doc),
    shipment: shipmentSummary,
    tracking: buildOrderTrackingPayload(doc, shipment),
    delivery: buildOrderDeliveryEstimate(shipment, carrierDeliveryDays),
    audit: buildAuditBlock(doc),
  };
};

/** Enrich a list of orders with shipments + item counts in batch. */
export const enrichOrdersDocuments = async (orders) => {
  if (!orders?.length) return [];
  const needsItemCount = orders.some((o) => !Array.isArray(o.items));
  const itemCountMap = needsItemCount ? await loadOrderItemCounts(orders.map((o) => o._id)) : new Map();
  const shipmentMap = await loadShipmentsForOrders(orders);
  const carrierDeliveryDaysMap = await loadCarrierDeliveryDaysForShipments([...shipmentMap.values()]);
  const enriched = orders.map((order) => {
    const shipment = shipmentMap.get(String(order._id)) ?? null;
    const carrierDeliveryDays = shipment?.carrier
      ? (carrierDeliveryDaysMap.get(String(shipment.carrier)) ?? null)
      : null;
    return enrichOrderDocument(
      order,
      shipment,
      itemCountMap.get(String(order._id)),
      carrierDeliveryDays
    );
  });
  return enrichDocsWithAudit(enriched);
};

// ── Checkout inputs: cart subtotal, store credit ──

/** Exported for cart.controller.js — sum of cart line totals. */
export const getCartSubtotal = (cart) => cart.items.reduce((sum, item) => sum + item.price * item.quantity, 0);

/** Current store-credit balance for a user (optional mongoose session). */
export const getStoreCreditBalance = async (userId, session = null) => {
  const user = await User.findById(userId).select('storeCreditBalance').session(session ?? null).lean();
  return roundMoney(user?.storeCreditBalance ?? 0);
};

/** Cap store credit applied at the payable amount. */
export const computeStoreCreditApplied = (balance, payable) => {
  const roundedBalance = roundMoney(balance);
  const roundedPayable = roundMoney(Math.max(0, payable));
  if (roundedBalance <= 0 || roundedPayable <= 0) {
    return { storeCreditApplied: 0, payableAfterCredit: roundedPayable };
  }
  const storeCreditApplied = roundMoney(Math.min(roundedBalance, roundedPayable));
  return { storeCreditApplied, payableAfterCredit: roundMoney(roundedPayable - storeCreditApplied) };
};

/** Debit store credit and write a StoreCreditTransaction inside a session. */
export const redeemStoreCredit = async ({ userId, amount, orderId, session }) => {
  const rounded = roundMoney(amount);
  if (rounded <= 0) return { redeemed: 0, balanceAfter: await getStoreCreditBalance(userId, session) };

  const balance = await getStoreCreditBalance(userId, session);
  if (rounded > balance + 0.001) {
    throw new ApiError('Insufficient store credit balance', 400);
  }

  const user = await User.findByIdAndUpdate(
    userId,
    { $inc: { storeCreditBalance: -rounded } },
    { new: true, session, runValidators: true }
  );

  if (!user) throw new ApiError(`No user found with id: ${userId}`, 404);

  const balanceAfter = roundMoney(user.storeCreditBalance);

  await StoreCreditTransaction.create(
    [{ user: userId, type: 'redeemed', amount: rounded, order: orderId, balanceAfter }],
    { session }
  );

  return { redeemed: rounded, balanceAfter };
};

/** After checkout succeeds; skips if user already recorded (safe for retries). */
const commitCouponUsage = async (couponId, userId) => {
  await Coupon.updateOne(
    { _id: couponId, usedBy: { $ne: userId } },
    { $addToSet: { usedBy: userId }, $inc: { usageCount: 1 } }
  );
};

// ── Stock adjustments ──

/** Bulk-adjust product stock/soldCount by delta (-1 checkout, +1 restore). */
const stockBulkWrite = (items, delta, session) =>
  Product.bulkWrite(
    items.map((item) => ({
      updateOne: {
        filter:
          delta < 0
            ? { _id: item.product, stock: { $gte: item.quantity }, isActive: true }
            : { _id: item.product },
        update: { $inc: { stock: delta * item.quantity, soldCount: -delta * item.quantity } },
      },
    })),
    { session, ordered: true }
  );

/** Decrement stock for checkout; throws with a specific product name on shortfall. */
const decrementStockForOrderItems = async (orderItems, session) => {
  if (!orderItems?.length) return;

  const result = await stockBulkWrite(orderItems, -1, session);
  if (result.modifiedCount === orderItems.length) return;

  for (const item of orderItems) {
    const product = await Product.findById(item.product).session(session).select('stock isActive name');
    if (!product?.isActive || product.stock < item.quantity) {
      throw new ApiError(`Not enough stock for "${item.name}"`, 400);
    }
  }
  throw new ApiError('Not enough stock for one or more items', 400);
};

/** Restore stock after cancel/refund (exported for reuse). */
export const restoreStockForOrderItems = async (orderItems, session) => {
  if (!orderItems?.length) return;
  await stockBulkWrite(orderItems, 1, session);
};

/** Map populated cart lines to order item snapshots; validates stock/active. */
const mapCartItemsToOrderItems = (cartItems) =>
  cartItems.map((item) => {
    const product = item.product;
    if (!product?.isActive) {
      throw new ApiError(`Product is no longer available: ${product?._id ?? 'unknown'}`, 400);
    }
    if (product.stock < item.quantity) {
      throw new ApiError(`Not enough stock for "${product.name}"`, 400);
    }
    return {
      product: product._id,
      name: product.name,
      image: product.images?.[0] ?? null,
      // Re-resolve at checkout so an expired offer cannot keep a stale cart price.
      price: resolveProductPrice(product),
      quantity: item.quantity,
    };
  });

// ── Checkout: shipping snapshot, cart → order ──

// Default shipping method label stamped onto new orders
const DEFAULT_SHIPPING_METHOD_NAME = 'Standard delivery';

/** Build shipping price + address snapshot from zone ids / address line. */
export const buildShippingSnapshot = async ({ governorateId, districtId, addressLine }) => {
  const wantOther = !districtId || String(districtId).toLowerCase() === 'other';

  const resolved = await resolveZoneRefs(
    { governorateId, districtId: wantOther ? 'other' : districtId, isOther: wantOther },
    { soft: true }
  );

  if (!resolved.ok || !resolved.governorateId) {
    throw new ApiError('Governorate not found', 404);
  }

  const governorate = await Governorate.findById(resolved.governorateId).populate('country', 'name isActive');
  if (!governorate?.isActive) throw new ApiError('Governorate not found', 404);
  if (!governorate.country?.isActive) {
    throw new ApiError('Country is not available for shipping', 400);
  }

  const line = String(addressLine || '').trim();
  if (line.length < 6) {
    throw new ApiError('addressLine must be at least 6 characters for delivery', 400);
  }

  // Fetch the district at most once (fixes the old double-fetch: resolveShipping used to
  // re-fetch the same governorate/district that had already been loaded just above).
  const wantsSpecificDistrict = !resolved.unresolved && !resolved.isOther && resolved.districtId;
  const district = wantsSpecificDistrict ? await District.findById(resolved.districtId) : null;
  const isOther = !district || !district.isCovered;
  const shippingPrice = isOther ? governorate.shippingPrice : district.shippingPrice;

  return {
    shippingPrice,
    shippingAddress: {
      countryName: governorate.country.name,
      governorateName: governorate.name,
      districtName: isOther ? 'Other' : district.name,
      addressLine: line,
      isOther,
      countryId: governorate.country._id,
      governorateId: governorate._id,
      districtId: isOther ? null : district._id,
    },
  };
};

/** Load cart, validate coupon/stock, resolve shipping + store credit for checkout. */
export const prepareCheckoutFromCart = async (userId, addressInput) => {
  const cart = await Cart.findOne({ user: userId }).populate(
    'items.product',
    'name images price priceAfterDiscount offerEndsAt stock isActive'
  );
  if (!cart?.items?.length) throw new ApiError('Cart is empty', 400);

  const cartProducts = cart.items.map((item) => item.product).filter(Boolean);
  await refreshProductOffers(cartProducts);

  const orderItems = mapCartItemsToOrderItems(cart.items);
  // Prefer live offer pricing over any stale cart line prices.
  const subtotal = roundMoney(
    orderItems.reduce((sum, item) => sum + item.price * item.quantity, 0),
  );

  let { discountAmount = 0, couponCode, couponId } = cart;
  let freeShipping = false;
  if (couponId) {
    const coupon = await Coupon.findById(couponId);
    // Lazy import avoids a hard circular-import edge at module-eval time; cart.controller.js owns coupon validation.
    const { assertCouponApplicable, calculateCouponDiscount, isFreeShippingCoupon } = await import(
      './cart.controller.js'
    );
    if (assertCouponApplicable(coupon, userId, subtotal)) {
      throw new ApiError('Cart coupon is no longer valid. Remove it and try again.', 400);
    }
    freeShipping = isFreeShippingCoupon(coupon);
    discountAmount = calculateCouponDiscount(coupon, subtotal);
  } else {
    discountAmount = 0;
    couponCode = null;
  }

  const shippingSnapshot = await buildShippingSnapshot(addressInput);
  // freeShipping coupons waive zone/governorate shipping fees entirely
  const shippingPrice = freeShipping ? 0 : shippingSnapshot.shippingPrice;
  const shipping = {
    methodName: DEFAULT_SHIPPING_METHOD_NAME,
    price: shippingPrice,
    quotedAt: new Date(),
  };

  const payable = Math.max(0, subtotal - discountAmount + shippingPrice);
  const storeCreditBalance = await getStoreCreditBalance(userId);
  const { storeCreditApplied, payableAfterCredit } = computeStoreCreditApplied(storeCreditBalance, payable);

  return {
    cartId: cart._id,
    userId,
    orderItems,
    subtotal,
    shippingPrice,
    shipping,
    shippingAddress: shippingSnapshot.shippingAddress,
    discountAmount,
    storeCreditApplied,
    totalPrice: payableAfterCredit,
    couponCode,
    couponId,
    freeShipping,
  };
};

/** Storefront URL for order details / tracking (override path via ORDER_DETAILS_PATH). */
const buildOrderDetailsUrl = (orderId) => {
  const base = (process.env.CLIENT_URL || 'http://localhost:3000').replace(/\/$/, '');
  const path = process.env.ORDER_DETAILS_PATH || '/order-details/{orderId}';
  if (path.includes('{orderId}')) {
    return `${base}${path.replace('{orderId}', String(orderId))}`;
  }
  const sep = path.includes('?') ? '&' : '?';
  return `${base}${path}${sep}orderId=${orderId}`;
};

/** Fire-and-forget order confirmation email; never blocks/fails checkout. */
const notifyOrderConfirmation = async (order) => {
  if (!order?.user) return;

  try {
    const user = await User.findById(order.user).select('name email');
    if (!user?.email) return;

    const { subject, html } = orderConfirmationTemplate({
      name: user.name,
      orderId: order._id,
      orderDetailsUrl: buildOrderDetailsUrl(order._id),
      items: order.items,
      subtotal: order.subtotal,
      shippingPrice: order.shippingPrice,
      discountAmount: order.discountAmount,
      storeCreditApplied: order.storeCreditApplied,
      totalPrice: order.totalPrice,
      paymentMethod: order.paymentMethod,
      paymentStatus: order.paymentStatus,
      shippingAddress: order.shippingAddress,
      createdAt: order.createdAt,
    });

    await sendEmail({ email: user.email, subject, html });
  } catch (err) {
    logger.error(`Order confirmation email failed for order ${order._id}: ${err.message}`);
  }
};

/** Persist order + stock debit + optional credit redeem + clear cart in a transaction. */
export const fulfillCheckout = async (snapshot, payment, options = {}) => {
  const { clearCart = true } = options;
  const userId = snapshot.user ?? snapshot.userId ?? null;
  const customerName = snapshot.customerName ? String(snapshot.customerName).trim() : null;
  const items = snapshot.orderItems ?? snapshot.items;
  const {
    shippingAddress,
    subtotal,
    shippingPrice,
    shipping,
    discountAmount,
    storeCreditApplied = 0,
    totalPrice,
    couponCode,
    couponId,
  } = snapshot;

  const session = await mongoose.startSession();
  let order;

  try {
    await session.withTransaction(async () => {
      await decrementStockForOrderItems(items, session);

      [order] = await Order.create(
        [
          {
            user: userId,
            customerName,
            items,
            shippingAddress,
            shipping: shipping ?? { methodName: DEFAULT_SHIPPING_METHOD_NAME, price: shippingPrice, quotedAt: new Date() },
            subtotal,
            shippingPrice,
            discountAmount,
            storeCreditApplied,
            totalPrice,
            couponCode,
            couponId,
            paymentMethod: payment.method,
            paymentStatus: payment.status,
            paymentProvider: payment.provider ?? null,
            paymentReference: payment.reference ?? null,
            orderStatus: payment.orderStatus ?? 'pending',
            ...(snapshot.createdBy ? { createdBy: snapshot.createdBy } : {}),
            ...(payment.status === 'paid' && payment.method === 'cod'
              ? { codCollectedAt: new Date() }
              : {}),
          },
        ],
        { session }
      );

      if (storeCreditApplied > 0 && userId) {
        await redeemStoreCredit({ userId, amount: storeCreditApplied, orderId: order._id, session });
      }

      if (clearCart && userId) {
        await Cart.deleteOne({ user: userId }, { session });
      }
    });

    if (couponId && userId) await commitCouponUsage(couponId, userId);
    // After commit so a mail failure never rolls back the order
    await notifyOrderConfirmation(order);
    return order;
  } finally {
    session.endSession();
  }
};

/** Convert an order shippingAddress snapshot into a User.addresses subdoc shape. */
const buildUserAddressFromSnapshot = (shippingAddress, { label = '', isDefault = false } = {}) => ({
  label: String(label || '').trim(),
  governorate: { id: shippingAddress.governorateId, name: shippingAddress.governorateName },
  district: shippingAddress.isOther
    ? null
    : { id: shippingAddress.districtId, name: shippingAddress.districtName },
  addressLine: shippingAddress.addressLine,
  isOther: shippingAddress.isOther,
  isDefault: Boolean(isDefault),
});

/** Clear isDefault on all addresses except keepId. */
const clearOtherDefaults = (addresses, keepId = null) => {
  for (const entry of addresses) {
    if (!keepId || String(entry._id) !== String(keepId)) entry.isDefault = false;
  }
};

/** Resolve checkout address from saved addressId or raw zone + line input. */
export const resolveCheckoutAddressInput = async (
  userId,
  { addressId, governorateId, districtId, addressLine }
) => {
  if (addressId) {
    const user = await User.findById(userId).select('addresses');
    const saved =
      user?.addresses?.id(addressId) || user?.addresses?.find((a) => String(a._id) === String(addressId));
    if (!saved) throw new ApiError(`No address found with id: ${addressId}`, 404);

    const heal = await healUserAddressEntry(saved, { soft: false });
    if (heal.healed) await user.save();

    return {
      governorateId: saved.governorate.id,
      districtId: saved.isOther ? 'other' : saved.district?.id,
      addressLine: saved.addressLine,
    };
  }

  if (!governorateId || !String(addressLine || '').trim()) {
    throw new ApiError('Provide addressId or governorateId + addressLine', 400);
  }

  const resolved = await resolveZoneRefs({
    governorateId,
    districtId: districtId ?? 'other',
    isOther: !districtId || String(districtId).toLowerCase() === 'other',
  });

  return {
    governorateId: resolved.governorateId,
    districtId: resolved.isOther ? 'other' : resolved.districtId,
    addressLine,
  };
};

/** Persist a new address on the user from checkout zone input. */
export const appendUserAddress = async (userId, addressInput, { label = '', isDefault = false } = {}) => {
  const user = await User.findById(userId);
  if (!user) throw new ApiError('Your account no longer exists', 404);

  const { shippingAddress } = await buildShippingSnapshot(addressInput);
  const entry = buildUserAddressFromSnapshot(shippingAddress, { label, isDefault });

  if (isDefault || user.addresses.length === 0) {
    clearOtherDefaults(user.addresses);
    entry.isDefault = true;
  }

  user.addresses.push(entry);
  await user.save();
  return user.addresses.at(-1);
};

// ── Order queries & refund helpers ──

/** Paginated Order.find with ApiFeatures + optional user populate. */
const queryPaginatedOrders = async (filter, req, { populateUser = false } = {}) => {
  const features = new ApiFeatures(Order.find(filter), req.query).filter().sort().limitFields();
  await features.paginate();

  let query = features.mongooseQuery;
  if (!req.query.fields) query = query.select(ORDER_LIST_SELECT);
  if (populateUser) query = query.populate('user', 'name email phone avatar');

  const orders = await query.lean();
  return { orders, pagination: { ...features.getPaginationResult(), results: orders.length } };
};

/** Mark paid order refunded, restore stock; idempotent if already refunded. */
const markOrderRefundedInDb = async (orderId) => {
  const session = await mongoose.startSession();
  let updated;

  try {
    await session.withTransaction(async () => {
      const order = await Order.findOneAndUpdate(
        { _id: orderId, paymentStatus: 'paid' },
        { paymentStatus: 'refunded', orderStatus: 'cancelled' },
        { new: true, session }
      );

      if (!order) {
        const existing = await Order.findById(orderId).session(session);
        if (existing?.paymentStatus === 'refunded') {
          updated = existing;
          return;
        }
        throw new ApiError('Order is not in a refundable state', 409);
      }

      await restoreStockForOrderItems(order.items, session);
      updated = order;
    });
  } finally {
    session.endSession();
  }

  return updated;
};

/** Full Stripe/Paymob refund for a paid card order, then mark refunded in DB. */
const processCardOrderRefund = async (order) => {
  if (order.paymentStatus === 'refunded') {
    return { order, gatewayRefundId: null, alreadyRefunded: true };
  }
  if (order.paymentMethod !== 'card' || !CARD_PROVIDERS.has(order.paymentProvider)) {
    throw new ApiError('Only paid Stripe or Paymob card orders can be refunded through this endpoint', 400);
  }
  if (order.paymentStatus !== 'paid') {
    throw new ApiError('Order is not in a refundable state', 400);
  }
  if (!order.paymentReference) {
    throw new ApiError('Order has no payment reference for refund', 400);
  }

  const { createStripeRefund, resolveStripePaymentIntentId, createPaymobRefund } = await import(
    './payment.controller.js'
  );

  let gatewayRefundId;
  if (order.paymentProvider === 'stripe') {
    const paymentIntentId = await resolveStripePaymentIntentId(order.paymentReference);
    gatewayRefundId = (await createStripeRefund({ paymentIntentId })).id;
  } else {
    const refund = await createPaymobRefund({
      transactionId: order.paymentReference,
      amountCents: toMinorUnits(order.totalPrice),
    });
    gatewayRefundId = String(refund.id ?? refund.transaction_id ?? '');
  }

  const updated = await markOrderRefundedInDb(order._id);
  return { order: updated, gatewayRefundId, alreadyRefunded: false };
};

/** Idempotent DB refund sync when Stripe charge.refunded webhook fires. */
export const syncOrderRefundedFromStripe = async (paymentIntentId) => {
  if (!paymentIntentId) return null;

  const order = await Order.findOne({
    paymentProvider: 'stripe',
    paymentMethod: 'card',
    paymentStatus: 'paid',
    paymentReference: paymentIntentId,
  });

  return order ? markOrderRefundedInDb(order._id) : null;
};

/** Find an order owned by userId. */
const findUserOrder = (orderId, userId) => Order.findOne({ _id: orderId, user: userId });

/** Standard 404 ApiError for missing orders. */
const orderNotFound = (id) => new ApiError(`No order found with id: ${id}`, 404);

/** Send a single enriched order response (loads shipment). */
const respondWithOrder = async (res, order, { message, statusCode = 200 }) => {
  const shipment = await Shipment.findOne({ order: order._id }).lean();
  let carrierDeliveryDays = null;
  if (shipment?.carrier && isCommittedCarrierAssignment(shipment)) {
    const carrier = await Carrier.findById(shipment.carrier).select('deliveryDays').lean();
    carrierDeliveryDays = carrier?.deliveryDays ?? null;
  }
  // Re-fetch with user + audit so admin detail always has customer name/email/phone.
  const orderDoc = await withOrderAuditPopulate(
    Order.findById(order._id).populate('user', 'name email phone avatar'),
  );
  sendResponse(res, {
    statusCode,
    message,
    data: enrichOrderDocument(orderDoc ?? order, shipment, null, carrierDeliveryDays),
  });
};

/** Shared list path for my-orders and admin getOrders. */
const listOrders = async (req, filter, { populateUser = false } = {}) => {
  const { orders, pagination } = await queryPaginatedOrders(filter, req, { populateUser });
  return { data: await enrichOrdersDocuments(orders), pagination };
};

// ── Route handlers ──

/**
 * @desc    Create COD order from cart (immediate fulfillment)
 * @route   POST /api/v1/orders
 * @access  Private
 */
export const createOrder = asyncHandler(async (req, res, next) => {
  const { addressId, governorateId, districtId, addressLine, paymentMethod, saveAddress, label, setAsDefault } =
    req.body;

  if (paymentMethod !== 'cod') {
    return next(
      new ApiError(
        'Card payments must use POST /api/v1/orders/payment-session. Order is created after payment succeeds.',
        400
      )
    );
  }

  const codEnabled = await PaymentGateway.isGatewayEnabled('cod');
  if (!codEnabled) {
    return next(new ApiError('Cash on Delivery is currently disabled', 400));
  }

  const userId = req.user._id;
  const addressInput = { addressId, governorateId, districtId, addressLine };
  const resolved = await resolveCheckoutAddressInput(userId, addressInput);
  const checkout = await prepareCheckoutFromCart(userId, resolved);

  if (saveAddress) {
    await appendUserAddress(userId, resolved, { label, isDefault: setAsDefault ?? false });
  }

  const order = await fulfillCheckout({ ...checkout, userId }, { method: 'cod', status: 'pending' });
  await respondWithOrder(res, order, { statusCode: 201, message: 'Order created successfully' });
});

/** Resolve product line price: optional B2B override, else live offer/list price. */
const resolveLineUnitPrice = (product, unitPrice) => {
  if (unitPrice != null && Number.isFinite(Number(unitPrice))) {
    return roundMoney(Number(unitPrice));
  }
  return roundMoney(resolveProductPrice(product));
};

/** Map admin B2B item payload → order item snapshots (validates stock/active). */
const mapB2BItemsToOrderItems = async (items) => {
  const merged = new Map();
  for (const item of items) {
    const key = String(item.productId);
    const prev = merged.get(key);
    if (prev) {
      prev.quantity += item.quantity;
      if (item.unitPrice != null) prev.unitPrice = item.unitPrice;
    } else {
      merged.set(key, {
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
      });
    }
  }
  const normalized = [...merged.values()];

  const productIds = normalized.map((item) => item.productId);
  const products = await Product.find({ _id: { $in: productIds } }).select(
    'name images price priceAfterDiscount offerEndsAt stock isActive'
  );
  const byId = new Map(products.map((p) => [String(p._id), p]));

  return normalized.map((item) => {
    const product = byId.get(String(item.productId));
    if (!product) throw new ApiError(`No product found with id: ${item.productId}`, 404);
    if (!product.isActive) {
      throw new ApiError(`Product is no longer available: ${product.name}`, 400);
    }
    if (product.stock < item.quantity) {
      throw new ApiError(`Not enough stock for "${product.name}"`, 400);
    }

    return {
      product: product._id,
      name: product.name,
      image: product.images?.[0] ?? null,
      price: resolveLineUnitPrice(product, item.unitPrice),
      quantity: item.quantity,
    };
  });
};

/** Build checkout snapshot for admin-created B2B orders (no cart / no registered user). */
const prepareB2BCheckout = async ({
  customerName,
  items,
  addressInput,
  couponCode,
  forceFreeShipping = false,
}) => {
  const orderItems = await mapB2BItemsToOrderItems(items);
  const subtotal = roundMoney(orderItems.reduce((sum, item) => sum + item.price * item.quantity, 0));

  let discountAmount = 0;
  let couponId = null;
  let normalizedCouponCode = null;
  let freeShipping = Boolean(forceFreeShipping);

  if (couponCode) {
    const coupon = await Coupon.findOne({
      code: String(couponCode).toUpperCase(),
      isActive: true,
    });
    const { assertCouponApplicable, calculateCouponDiscount, isFreeShippingCoupon } = await import(
      './cart.controller.js'
    );
    // No registered user — skip per-user coupon reuse tracking
    if (!coupon || assertCouponApplicable(coupon, null, subtotal)) {
      throw new ApiError('Invalid or inapplicable coupon', 400);
    }
    freeShipping = freeShipping || isFreeShippingCoupon(coupon);
    discountAmount = calculateCouponDiscount(coupon, subtotal);
    couponId = coupon._id;
    normalizedCouponCode = coupon.code;
  }

  const shippingSnapshot = await buildShippingSnapshot(addressInput);
  const shippingPrice = freeShipping ? 0 : shippingSnapshot.shippingPrice;
  const shipping = {
    methodName: DEFAULT_SHIPPING_METHOD_NAME,
    price: shippingPrice,
    quotedAt: new Date(),
  };
  const totalPrice = Math.max(0, roundMoney(subtotal - discountAmount + shippingPrice));

  return {
    userId: null,
    customerName,
    orderItems,
    subtotal,
    shippingPrice,
    shipping,
    shippingAddress: shippingSnapshot.shippingAddress,
    discountAmount,
    storeCreditApplied: 0,
    totalPrice,
    couponCode: normalizedCouponCode,
    couponId,
    freeShipping,
  };
};

/**
 * @desc    Create B2B order from admin dashboard (no cart; free-text customer name)
 * @route   POST /api/v1/orders/b2b
 * @access  Admin
 */
export const createOrderB2B = asyncHandler(async (req, res, next) => {
  const {
    customerName,
    items,
    governorateId,
    districtId,
    addressLine,
    couponCode,
    freeShipping,
    paymentMethod = 'cod',
    markPaid = false,
  } = req.body;

  if (paymentMethod !== 'cod') {
    return next(new ApiError('B2B orders currently support paymentMethod: cod only', 400));
  }

  const addressInput = await resolveCheckoutAddressInput(null, {
    governorateId,
    districtId,
    addressLine,
  });

  const checkout = await prepareB2BCheckout({
    customerName: String(customerName).trim(),
    items,
    addressInput,
    couponCode,
    forceFreeShipping: Boolean(freeShipping),
  });

  const order = await fulfillCheckout(
    { ...checkout, createdBy: req.user._id },
    {
      method: 'cod',
      status: markPaid ? 'paid' : 'pending',
      orderStatus: 'pending',
    },
    { clearCart: false }
  );

  recordAdminActivity(req, {
    tab: 'orders',
    action: 'create',
    resourceType: 'order',
    resourceId: order._id,
    resourceLabel: buildOrderActivityLabel(order, checkout.customerName),
    summary: `Created B2B order ${buildOrderActivityLabel(order, checkout.customerName)}`,
  });

  await respondWithOrder(res, order, {
    statusCode: 201,
    message: 'B2B order created successfully',
  });
});

/**
 * @desc    List current user's orders
 * @route   GET /api/v1/orders/my-orders
 * @access  Private
 */
export const getMyOrders = asyncHandler(async (req, res) => {
  const { data, pagination } = await listOrders(req, { user: req.user._id });
  sendResponse(res, { message: 'Orders retrieved successfully', data, pagination });
});

/**
 * @desc    Get one order for current user
 * @route   GET /api/v1/orders/my-orders/:id
 * @access  Private
 */
export const getMyOrder = asyncHandler(async (req, res, next) => {
  const order = await findUserOrder(req.params.id, req.user._id);
  if (!order) return next(orderNotFound(req.params.id));
  await respondWithOrder(res, order, { message: 'Order retrieved successfully' });
});

/**
 * @desc    List all orders (admin)
 * @route   GET /api/v1/orders
 * @access  Admin
 */
export const getOrders = asyncHandler(async (req, res) => {
  const { data, pagination } = await listOrders(req, {}, { populateUser: true });
  sendResponse(res, { message: 'Orders retrieved successfully', data, pagination });
});

/**
 * @desc    Get one order (admin)
 * @route   GET /api/v1/orders/:id
 * @access  Admin
 */
export const getOrder = asyncHandler(async (req, res, next) => {
  const order = await Order.findById(req.params.id).populate('user', 'name email phone avatar');
  if (!order) return next(orderNotFound(req.params.id));
  await respondWithOrder(res, order, { message: 'Order retrieved successfully' });
});

/**
 * @desc    Update order status (admin)
 * @route   PATCH /api/v1/orders/:id/status
 * @access  Admin
 */
export const updateOrderStatus = asyncHandler(async (req, res, next) => {
  const existing = await Order.findById(req.params.id);
  if (!existing) return next(orderNotFound(req.params.id));

  const update = { orderStatus: req.body.orderStatus, statusUpdatedBy: req.user._id };
  if (req.body.orderStatus === 'delivered' && !existing.deliveredAt) {
    update.deliveredAt = new Date();
    if (existing.paymentMethod === 'cod' && existing.paymentStatus === 'pending') {
      update.paymentStatus = 'paid';
      update.codCollectedAt = new Date();
    }
  }

  const order = await Order.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true })
    .populate('user', 'name email phone avatar');

  const orderLabel = buildOrderActivityLabel(order);

  recordAdminActivity(req, {
    tab: 'orders',
    action: 'update',
    resourceType: 'order',
    resourceId: order._id,
    resourceLabel: orderLabel,
    summary: `Updated ${orderLabel} status to "${req.body.orderStatus}"`,
    changes: buildFieldChange('orderStatus', existing.orderStatus, req.body.orderStatus),
  });

  await respondWithOrder(res, order, { message: 'Order status updated successfully' });
});

/**
 * @desc    Cancel order (user: pending/processing only; admin: any except delivered/cancelled)
 * @route   PATCH /api/v1/orders/:id/cancel
 * @access  Private (user or admin)
 */
export const cancelOrder = asyncHandler(async (req, res, next) => {
  const isAdmin = req.user.role === 'admin';
  const order = isAdmin ? await Order.findById(req.params.id) : await findUserOrder(req.params.id, req.user._id);

  if (!order) return next(orderNotFound(req.params.id));

  const blocked = isAdmin
    ? ADMIN_BLOCKED_CANCEL_STATUSES.has(order.orderStatus)
    : !USER_CANCELLABLE_STATUSES.has(order.orderStatus);

  if (blocked) {
    const message = isAdmin
      ? `Order cannot be cancelled while status is "${order.orderStatus}".`
      : `Order cannot be cancelled while status is "${order.orderStatus}". Only pending or processing orders can be cancelled.`;
    return next(new ApiError(message, 400));
  }

  const updated = await Order.findByIdAndUpdate(
    order._id,
    {
      orderStatus: 'cancelled',
      cancelledAt: new Date(),
      cancellationReason: req.body.reason?.trim() || null,
      cancelledBy: isAdmin ? 'admin' : 'user',
      ...(isAdmin ? { statusUpdatedBy: req.user._id } : {}),
    },
    { new: true, runValidators: true }
  );

  if (isAdmin) {
    const orderLabel = buildOrderActivityLabel(updated);
    recordAdminActivity(req, {
      tab: 'orders',
      action: 'cancel',
      resourceType: 'order',
      resourceId: updated._id,
      resourceLabel: orderLabel,
      summary: `Cancelled ${orderLabel}`,
    });
  }

  await respondWithOrder(res, updated, { message: 'Order cancelled successfully' });
});

/**
 * @desc    Full refund for a paid card order — Stripe or Paymob (admin)
 * @route   POST /api/v1/orders/:id/refund
 * @access  Admin
 */
export const refundOrder = asyncHandler(async (req, res, next) => {
  const order = await Order.findById(req.params.id);
  if (!order) return next(orderNotFound(req.params.id));

  const { order: updated, gatewayRefundId, alreadyRefunded } = await processCardOrderRefund(order);

  await Order.findByIdAndUpdate(updated._id, { statusUpdatedBy: req.user._id });

  const orderLabel = buildOrderActivityLabel(updated);

  recordAdminActivity(req, {
    tab: 'orders',
    action: 'refund',
    resourceType: 'order',
    resourceId: updated._id,
    resourceLabel: orderLabel,
    summary: alreadyRefunded
      ? `${orderLabel} was already refunded`
      : `Refunded ${orderLabel}`,
  });

  sendResponse(res, {
    message: alreadyRefunded ? 'Order is already refunded' : 'Order refunded successfully',
    data: {
      order: updated,
      gatewayRefundId,
      stripeRefundId: order.paymentProvider === 'stripe' ? gatewayRefundId : null,
    },
  });
});
