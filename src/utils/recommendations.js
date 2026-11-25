// src/utils/recommendations.js
import Cart from '../models/Cart.js';
import Product from '../models/Product.js';
import { refreshProductOffers } from './productOffer.js';
import { productPopulate, productSelect } from './populate/productPopulate.js';

const RECO_SELECT = `${productSelect} concerns`;

const idOf = (value) => (value?._id ?? value)?.toString?.() ?? null;
const bump = (map, key, weight) => {
  if (key) map.set(key, (map.get(key) ?? 0) + weight);
};

/** Recency weight: the most recent view counts most, then decays (1, .67, .5, .4 …). */
const recencyWeight = (rank) => 1 / (1 + rank * 0.5);

/** Popularity/quality nudge so ties resolve toward good, well-known products. */
const qualityScore = (p) =>
  Math.log10((p.views ?? 0) + 1) * 0.4 +
  Math.log10((p.soldCount ?? 0) + 1) * 0.5 +
  (p.isBestSeller ? 0.6 : 0) +
  ((p.ratingsAverage ?? 0) / 5) * 0.5;

/** Best sellers first, then by popularity — used to pad short or empty lists. */
export const getPopularProducts = async ({ excludeIds = [], limit = 12 } = {}) => {
  const products = await Product.find({ isActive: true, stock: { $gt: 0 }, _id: { $nin: excludeIds } })
    .select(RECO_SELECT)
    .populate(productPopulate)
    .sort({ isBestSeller: -1, soldCount: -1, views: -1 })
    .limit(limit)
    .lean();
  await refreshProductOffers(products);
  return products.map((p) => ({ ...p, recommendationReason: 'popular' }));
};

/**
 * "Picked for you": score unseen products against the shopper's recent views
 * (category, sub-category, brand, concerns), skipping cart items; pad with popular items.
 * @param history user.browsingHistory populated with `product`, newest first
 */
export const buildPersonalRecommendations = async ({ userId, history, limit = 20 }) => {
  const viewed = history.filter((h) => h.product);
  const viewedIds = viewed.map((h) => idOf(h.product));

  const cart = await Cart.findOne({ user: userId }).select('items.product').lean();
  const excludeIds = [...viewedIds, ...(cart?.items ?? []).map((i) => idOf(i.product))].filter(Boolean);

  if (!viewed.length) return getPopularProducts({ excludeIds, limit });

  const cats = new Map();
  const subs = new Map();
  const brands = new Map();
  const concerns = new Map();
  viewed.forEach((h, rank) => {
    const w = recencyWeight(rank);
    const p = h.product;
    bump(cats, idOf(p.category), w);
    (p.subCategory ?? []).forEach((s) => bump(subs, idOf(s), w));
    bump(brands, idOf(p.brand), w);
    (p.concerns ?? []).forEach((c) => bump(concerns, c, w));
  });

  const candidates = await Product.find({
    isActive: true,
    stock: { $gt: 0 },
    _id: { $nin: excludeIds },
    $or: [
      { category: { $in: [...cats.keys()] } },
      { subCategory: { $in: [...subs.keys()] } },
      { brand: { $in: [...brands.keys()] } },
      { concerns: { $in: [...concerns.keys()] } },
    ],
  })
    .select(RECO_SELECT)
    .populate(productPopulate)
    .limit(120)
    .lean();

  const scored = candidates
    .map((p) => {
      const scores = {
        category: (cats.get(idOf(p.category)) ?? 0) * 2,
        subCategory: Math.max(0, ...(p.subCategory ?? []).map((s) => subs.get(idOf(s)) ?? 0)) * 2.5,
        brand: (brands.get(idOf(p.brand)) ?? 0) * 2,
        concerns: (p.concerns ?? []).reduce((sum, c) => sum + (concerns.get(c) ?? 0), 0) * 1.5,
      };
      const reason = Object.entries(scores).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'popular';
      const score = Object.values(scores).reduce((a, b) => a + b, 0) + qualityScore(p);
      return { product: p, score, reason };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  const picked = scored.map(({ product, reason }) => ({ ...product, recommendationReason: reason }));
  await refreshProductOffers(picked);

  if (picked.length < limit) {
    const pad = await getPopularProducts({
      excludeIds: [...excludeIds, ...picked.map((p) => idOf(p))],
      limit: limit - picked.length,
    });
    picked.push(...pad);
  }
  return picked;
};

/** "You may also like" for one product: same concerns/sub-category first, then brand, then category. */
export const buildRelatedProducts = async (productId, limit = 12) => {
  const base = await Product.findById(productId).select('category subCategory brand concerns').lean();
  if (!base) return null;

  const subIds = (base.subCategory ?? []).map(idOf);
  const candidates = await Product.find({
    isActive: true,
    stock: { $gt: 0 },
    _id: { $ne: productId },
    $or: [
      { subCategory: { $in: subIds } },
      { concerns: { $in: base.concerns ?? [] } },
      { brand: base.brand },
      { category: base.category },
    ],
  })
    .select(RECO_SELECT)
    .populate(productPopulate)
    .limit(100)
    .lean();

  const baseConcerns = new Set(base.concerns ?? []);
  const scored = candidates
    .map((p) => {
      const sharedConcerns = (p.concerns ?? []).filter((c) => baseConcerns.has(c)).length;
      const sameSub = (p.subCategory ?? []).some((s) => subIds.includes(idOf(s)));
      const sameBrand = idOf(p.brand) === idOf(base.brand);
      const sameCat = idOf(p.category) === idOf(base.category);
      const score =
        (sameSub ? 3 : 0) + sharedConcerns * 2 + (sameBrand ? 1.5 : 0) + (sameCat ? 1 : 0) + qualityScore(p);
      const reason = sharedConcerns ? 'concerns' : sameSub ? 'subCategory' : sameBrand ? 'brand' : 'category';
      return { product: p, score, reason };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  const picked = scored.map(({ product, reason }) => ({ ...product, recommendationReason: reason }));
  await refreshProductOffers(picked);

  if (picked.length < limit) {
    picked.push(
      ...(await getPopularProducts({
        excludeIds: [productId, ...picked.map((p) => idOf(p))],
        limit: limit - picked.length,
      })),
    );
  }
  return picked;
};

/** Active products for a list of ids, in the order requested (guest browsing history). */
export const getProductsByIds = async (ids, limit = 20) => {
  const unique = [...new Set(ids.map(String))].slice(0, limit);
  const products = await Product.find({ _id: { $in: unique }, isActive: true })
    .select(RECO_SELECT)
    .populate(productPopulate)
    .lean();
  await refreshProductOffers(products);
  const byId = new Map(products.map((p) => [idOf(p), p]));
  return unique.map((id) => byId.get(id)).filter(Boolean);
};
