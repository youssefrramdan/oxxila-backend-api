// src/utils/productOffer.js
import Offer from '../models/Offer.js';
import Product from '../models/Product.js';

const isOfferWindowLive = (offer, now = new Date()) => {
  if (!offer || offer.isActive === false) return false;
  if (offer.startDate == null || offer.endDate == null) return false;
  return new Date(offer.startDate) <= now && new Date(offer.endDate) > now;
};

/** True when denormalized product discount is still within its offer window. */
export const isProductOfferLive = (product, now = new Date()) => {
  if (product?.priceAfterDiscount == null || product.offerEndsAt == null) return false;
  return new Date(product.offerEndsAt) > now;
};

/** Live discounted unit price, or null when the offer window is over / missing. */
export const getLivePriceAfterDiscount = (product, now = new Date()) =>
  isProductOfferLive(product, now) ? product.priceAfterDiscount : null;

/** Sell price: live offer price when valid, otherwise list price. */
export const resolveProductPrice = (product, now = new Date()) =>
  getLivePriceAfterDiscount(product, now) ?? product?.price;

const computeOfferPrice = (listPrice, offer) => {
  const discount =
    offer.discountPercent != null
      ? (listPrice * offer.discountPercent) / 100
      : offer.discountAmount;
  return +Math.max(listPrice - discount, 0).toFixed(2);
};

const clearProductOfferFields = (productId) =>
  Product.findByIdAndUpdate(productId, {
    $set: { priceAfterDiscount: null, offerEndsAt: null },
  });

/**
 * Write (or clear) denormalized product offer fields from an Offer doc.
 * Pass null to clear. Non-live offers (scheduled / expired / inactive) clear too.
 */
export const syncProductOffer = async (productRef, offer = null, now = new Date()) => {
  const id = productRef?._id ?? productRef;
  if (!id) return;

  if (!offer || !isOfferWindowLive(offer, now)) {
    await clearProductOfferFields(id);
    return;
  }

  const product = await Product.findById(id).select('price');
  if (!product) return;

  await Product.findByIdAndUpdate(id, {
    $set: {
      priceAfterDiscount: computeOfferPrice(product.price, offer),
      offerEndsAt: offer.endDate,
    },
  });
};

/**
 * Keep product docs in sync at read time (replaces cron):
 * - clear expired denormalized discounts
 * - deactivate matching Offer rows
 * - apply offers whose start window just opened
 */
export const refreshProductOffers = async (products, now = new Date()) => {
  const list = (Array.isArray(products) ? products : [products]).filter(Boolean);
  if (!list.length) return;

  const expiredIds = [];
  for (const product of list) {
    if (product.offerEndsAt != null && new Date(product.offerEndsAt) <= now) {
      expiredIds.push(product._id);
      product.priceAfterDiscount = null;
      product.offerEndsAt = null;
    }
  }

  if (expiredIds.length) {
    await Product.updateMany(
      { _id: { $in: expiredIds } },
      { $set: { priceAfterDiscount: null, offerEndsAt: null } },
    );
    await Offer.updateMany(
      { product: { $in: expiredIds }, isActive: true, endDate: { $lte: now } },
      { $set: { isActive: false } },
    );
  }

  const needingSync = list.filter((product) => !isProductOfferLive(product, now));
  if (!needingSync.length) return;

  const liveOffers = await Offer.find({
    product: { $in: needingSync.map((p) => p._id) },
    isActive: true,
    startDate: { $lte: now },
    endDate: { $gt: now },
  });
  if (!liveOffers.length) return;

  const byProductId = new Map(needingSync.map((p) => [String(p._id), p]));

  await Promise.all(
    liveOffers.map(async (offer) => {
      const product = byProductId.get(String(offer.product));
      if (!product) return;

      const priceAfterDiscount = computeOfferPrice(product.price, offer);
      product.priceAfterDiscount = priceAfterDiscount;
      product.offerEndsAt = offer.endDate;

      await Product.findByIdAndUpdate(product._id, {
        $set: { priceAfterDiscount, offerEndsAt: offer.endDate },
      });
    }),
  );
};
