// src/utils/adminActivityLabels.js
import Order from '../models/Order.js';
import Product from '../models/Product.js';
import User from '../models/User.js';
import Offer from '../models/Offer.js';
import Banner from '../models/Banner.js';
import FAQ from '../models/FAQ.js';

const OBJECT_ID_RE = /^[a-f0-9]{24}$/i;

/** Tabs rolled up under Settings in the activity log UI. */
export const SETTINGS_ACTIVITY_TABS = Object.freeze([
  'settings',
  'websiteContent',
  'roles',
  'dashboard',
]);

/** Review logs to keep — moderation only (exclude customer/backfill creates). */
export const REVIEW_MODERATION_ACTIONS = Object.freeze(['hide', 'show', 'flag', 'unflag']);

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

/** Offer rows use product name + discount — never the offer ObjectId. */
export const formatOfferActivityLabel = (offer, product) => {
  const productName = product?.name?.trim() || 'Product';
  let discount = 'Offer';
  if (offer?.discountPercent != null) discount = `${offer.discountPercent}% off`;
  else if (offer?.discountAmount != null) discount = `${offer.discountAmount} off`;
  return `${discount} · ${productName}`;
};

/** FAQ activity label includes the parent product. */
export const formatFaqActivityLabel = (faq, product) => {
  const question = faq?.question?.trim() || 'FAQ';
  const productName = product?.name?.trim();
  return productName ? `${question} · ${productName}` : question;
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
  if (text.includes(`"${id}"`)) {
    text = text.split(`"${id}"`).join(`"${replacement}"`);
  }
  if (text.includes(id)) {
    text = text.split(id).join(replacement);
  }
  return text;
};

const rewriteSummaryResource = (summary, resourceType, label) => {
  let text = String(summary ?? '').trim();
  if (!text || !label) return text;
  return text.replace(
    new RegExp(`(Created|Updated|Hidden|Showed|Deleted)\\s+${resourceType}\\s+"[^"]*"`, 'i'),
    `$1 ${resourceType} "${label}"`,
  );
};

/**
 * Enrich list response with friendly labels (fixes legacy backfill rows).
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

  const productIds = new Set(
    logs
      .filter(
        (log) =>
          log.resourceType === 'product' &&
          isMongoObjectId(log.resourceId) &&
          looksLikeRawIdLabel(log.resourceLabel, log.resourceId),
      )
      .map((log) => String(log.resourceId)),
  );

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

  const offerIds = [
    ...new Set(
      logs
        .filter((log) => log.resourceType === 'offer' && isMongoObjectId(log.resourceId))
        .map((log) => String(log.resourceId)),
    ),
  ];

  const bannerIds = [
    ...new Set(
      logs
        .filter(
          (log) =>
            log.resourceType === 'banner' &&
            isMongoObjectId(log.resourceId) &&
            looksLikeRawIdLabel(log.resourceLabel, log.resourceId),
        )
        .map((log) => String(log.resourceId)),
    ),
  ];

  const faqIds = [
    ...new Set(
      logs
        .filter((log) => log.resourceType === 'faq' && isMongoObjectId(log.resourceId))
        .map((log) => String(log.resourceId)),
    ),
  ];

  const [orders, productsForIds, customers, offers, banners, faqs] = await Promise.all([
    orderIds.length
      ? Order.find({ _id: { $in: orderIds } })
          .select('customerName user')
          .populate('user', 'name')
          .lean()
      : [],
    productIds.size
      ? Product.find({ _id: { $in: [...productIds] } })
          .select('name')
          .lean()
      : [],
    customerIds.length ? User.find({ _id: { $in: customerIds } }).select('name email').lean() : [],
    offerIds.length
      ? Offer.find({ _id: { $in: offerIds } })
          .select('product discountPercent discountAmount')
          .populate('product', 'name')
          .lean()
      : [],
    bannerIds.length ? Banner.find({ _id: { $in: bannerIds } }).select('title').lean() : [],
    faqIds.length
      ? FAQ.find({ _id: { $in: faqIds } })
          .select('question product')
          .populate('product', 'name')
          .lean()
      : [],
  ]);

  const orderMap = new Map(orders.map((o) => [String(o._id), o]));
  const productMap = new Map(productsForIds.map((p) => [String(p._id), p]));
  const customerMap = new Map(customers.map((u) => [String(u._id), u]));
  const offerMap = new Map(offers.map((o) => [String(o._id), o]));
  const bannerMap = new Map(banners.map((b) => [String(b._id), b]));
  const faqMap = new Map(faqs.map((f) => [String(f._id), f]));

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

    if (log.resourceType === 'offer' && isMongoObjectId(log.resourceId)) {
      const offer = offerMap.get(String(log.resourceId));
      if (offer) {
        const product =
          offer.product && typeof offer.product === 'object' ? offer.product : null;
        const label = formatOfferActivityLabel(offer, product);
        entry.resourceLabel = label;
        entry.summary = replaceIdInSummary(entry.summary, log.resourceId, label);
        entry.summary = rewriteSummaryResource(entry.summary, 'offer', label);
      }
    }

    if (log.resourceType === 'banner' && isMongoObjectId(log.resourceId)) {
      const banner = bannerMap.get(String(log.resourceId));
      const title = banner?.title?.trim();
      if (title && looksLikeRawIdLabel(entry.resourceLabel, log.resourceId)) {
        entry.resourceLabel = title;
        entry.summary = replaceIdInSummary(entry.summary, log.resourceId, title);
        entry.summary = rewriteSummaryResource(entry.summary, 'banner', title);
      }
    }

    if (log.resourceType === 'faq' && isMongoObjectId(log.resourceId)) {
      const faq = faqMap.get(String(log.resourceId));
      if (faq) {
        const product = faq.product && typeof faq.product === 'object' ? faq.product : null;
        const label = formatFaqActivityLabel(faq, product);
        entry.resourceLabel = label;
        entry.summary = replaceIdInSummary(entry.summary, log.resourceId, label);
        entry.summary = rewriteSummaryResource(entry.summary, 'faq', label);
        if (product?._id) {
          entry.productId = String(product._id);
        } else if (faq.product) {
          entry.productId = String(faq.product);
        }
      }
    }

    return entry;
  });
};
