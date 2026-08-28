// src/utils/adminActivityLabels.js
import Order from '../models/Order.js';
import Product from '../models/Product.js';
import User from '../models/User.js';

const OBJECT_ID_RE = /^[a-f0-9]{24}$/i;

/** Matches admin UI order reference (#OX-AB12). */
export const formatAdminOrderNumber = (id) => {
  const raw = String(id ?? '').replace(/[^a-zA-Z0-9]/g, '');
  const short = (raw.slice(-4) || String(id).slice(-4)).toUpperCase();
  return `#OX-${short}`;
};

export const isMongoObjectId = (value) => OBJECT_ID_RE.test(String(value ?? '').trim());

export const resolveOrderCustomerName = (order) => {
  if (!order) return '';
  if (order.customerName?.trim()) return order.customerName.trim();
  const user = order.user;
  if (user && typeof user === 'object' && user.name?.trim()) return user.name.trim();
  return '';
};

/** Human label for activity log resource column. */
export const buildOrderActivityLabel = (orderOrId, customerName = '') => {
  const id = orderOrId?._id ?? orderOrId;
  const orderNo = formatAdminOrderNumber(id);
  const customer = customerName || resolveOrderCustomerName(orderOrId);
  return customer ? `Order ${orderNo} · ${customer}` : `Order ${orderNo}`;
};

const looksLikeRawIdLabel = (label, resourceId) => {
  const trimmed = String(label ?? '').trim();
  if (!trimmed || trimmed === '—') return true;
  if (isMongoObjectId(trimmed)) return true;
  if (resourceId && trimmed === String(resourceId)) return true;
  return false;
};

const replaceIdInSummary = (summary, resourceId, replacement) => {
  let text = String(summary ?? '');
  if (!text || !resourceId) return text;
  const id = String(resourceId);
  if (text.includes(id)) {
    text = text.split(id).join(replacement);
  }
  if (text.includes(`"${id}"`)) {
    text = text.split(`"${id}"`).join(`"${replacement}"`);
  }
  return text;
};

/**
 * Enrich list response with friendly order/product labels (fixes legacy backfill rows).
 */
export const enrichActivityLogs = async (logs) => {
  if (!logs?.length) return logs ?? [];

  const orderIds = [
    ...new Set(
      logs
        .filter((log) => log.resourceType === 'order' && isMongoObjectId(log.resourceId))
        .map((log) => String(log.resourceId)),
    ),
  ];

  const productIds = [
    ...new Set(
      logs
        .filter(
          (log) =>
            log.resourceType === 'product' &&
            isMongoObjectId(log.resourceId) &&
            looksLikeRawIdLabel(log.resourceLabel, log.resourceId),
        )
        .map((log) => String(log.resourceId)),
    ),
  ];

  const customerIds = [
    ...new Set(
      logs
        .filter(
          (log) =>
            (log.resourceType === 'user' || log.resourceType === 'customer') &&
            isMongoObjectId(log.resourceId) &&
            looksLikeRawIdLabel(log.resourceLabel, log.resourceId),
        )
        .map((log) => String(log.resourceId)),
    ),
  ];

  const [orders, products, customers] = await Promise.all([
    orderIds.length
      ? Order.find({ _id: { $in: orderIds } })
          .select('customerName user')
          .populate('user', 'name')
          .lean()
      : [],
    productIds.length ? Product.find({ _id: { $in: productIds } }).select('name').lean() : [],
    customerIds.length ? User.find({ _id: { $in: customerIds } }).select('name email').lean() : [],
  ]);

  const orderMap = new Map(orders.map((o) => [String(o._id), o]));
  const productMap = new Map(products.map((p) => [String(p._id), p]));
  const customerMap = new Map(customers.map((u) => [String(u._id), u]));

  return logs.map((log) => {
    const entry = { ...log };

    if (log.resourceType === 'order' && isMongoObjectId(log.resourceId)) {
      const order = orderMap.get(String(log.resourceId));
      const label = buildOrderActivityLabel(order ?? log.resourceId);
      if (looksLikeRawIdLabel(entry.resourceLabel, log.resourceId)) {
        entry.resourceLabel = label;
      }
      entry.summary = replaceIdInSummary(entry.summary, log.resourceId, label);
    }

    if (log.resourceType === 'product' && isMongoObjectId(log.resourceId)) {
      const product = productMap.get(String(log.resourceId));
      const name = product?.name?.trim();
      if (name && looksLikeRawIdLabel(entry.resourceLabel, log.resourceId)) {
        entry.resourceLabel = name;
        entry.summary = replaceIdInSummary(entry.summary, log.resourceId, name);
      }
    }

    if (
      (log.resourceType === 'user' || log.resourceType === 'customer') &&
      isMongoObjectId(log.resourceId)
    ) {
      const user = customerMap.get(String(log.resourceId));
      const name = user?.name?.trim() || user?.email?.trim();
      if (name && looksLikeRawIdLabel(entry.resourceLabel, log.resourceId)) {
        entry.resourceLabel = name;
        entry.summary = replaceIdInSummary(entry.summary, log.resourceId, name);
      }
    }

    return entry;
  });
};
