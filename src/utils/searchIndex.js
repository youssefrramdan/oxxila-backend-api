// src/utils/searchIndex.js
import Product from '../models/Product.js';
import { refreshProductOffers } from './productOffer.js';

/** Arabic + English labels for the `concerns` enum so "حب الشباب" finds acne products. */
const CONCERN_LABELS = {
  acne: ['acne', 'حب الشباب', 'حبوب'],
  pigmentation: ['pigmentation', 'dark spots', 'تصبغات', 'تصبغ', 'كلف'],
  'sensitive-skin': ['sensitive skin', 'بشرة حساسة', 'حساسية'],
  drought: ['dryness', 'dry skin', 'جفاف', 'بشرة جافة'],
  wrinkles: ['wrinkles', 'anti aging', 'تجاعيد', 'خطوط'],
  'wide-pores': ['pores', 'wide pores', 'مسام', 'مسام واسعة'],
};

const INDEX_TTL_MS = 30_000;
let cache = { builtAt: 0, docs: [], brands: [], categories: [], building: null };

/** Lowercase, strip diacritics/tatweel, unify Arabic letter variants, collapse spaces. */
export const normalizeText = (value) =>
  String(value ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[ً-ٰٟـ]/g, '') // tashkeel + tatweel
    .replace(/[̀-ͯ]/g, '') // latin accents
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const words = (text) => normalizeText(text).split(' ').filter(Boolean);

/** Bounded Levenshtein: returns max+1 as soon as the distance can't be within `max`. */
const editDistance = (a, b, max) => {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      rowMin = Math.min(rowMin, cur[j]);
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
};

/** Score one query token against a list of indexed words. 0 = no match. */
const scoreToken = (token, indexedWords) => {
  let best = 0;
  const maxEdits = token.length >= 8 ? 2 : token.length >= 4 ? 1 : 0;
  for (const word of indexedWords) {
    if (word === token) return 10;
    if (word.startsWith(token)) best = Math.max(best, 6);
    else if (token.length >= 3 && word.includes(token)) best = Math.max(best, 3);
    else if (maxEdits && editDistance(token, word.slice(0, token.length + 1), maxEdits) <= maxEdits) {
      best = Math.max(best, 2);
    }
  }
  return best;
};

const buildIndex = async () => {
  const products = await Product.find({ isActive: true })
    .select('name nameEn nameAr slug images price priceAfterDiscount offerEndsAt stock isBestSeller soldCount views concerns category subCategory brand')
    .populate([
      { path: 'category', select: 'nameEn nameAr slug' },
      { path: 'subCategory', select: 'nameEn nameAr' },
      { path: 'brand', select: 'nameEn nameAr slug' },
    ])
    .lean();

  const brands = new Map();
  const categories = new Map();
  const docs = products.map((p) => {
    const brandEn = p.brand?.nameEn ?? '';
    const brandAr = p.brand?.nameAr ?? '';
    if (p.brand?._id) brands.set(String(p.brand._id), { id: String(p.brand._id), slug: p.brand.slug, nameEn: brandEn, nameAr: brandAr });
    if (p.category?._id) categories.set(String(p.category._id), { id: String(p.category._id), slug: p.category.slug, nameEn: p.category.nameEn, nameAr: p.category.nameAr });

    const primary = [p.nameEn || p.name, p.nameAr].filter(Boolean);
    const secondary = [
      brandEn,
      brandAr,
      p.category?.nameEn,
      p.category?.nameAr,
      ...(p.subCategory ?? []).flatMap((s) => [s.nameEn, s.nameAr]),
      ...(p.concerns ?? []).flatMap((c) => CONCERN_LABELS[c] ?? [c]),
    ].filter(Boolean);

    return {
      product: p,
      id: String(p._id),
      primaryWords: primary.flatMap(words),
      secondaryWords: secondary.flatMap(words),
      phrase: normalizeText(primary.join(' ')),
      popularity: Math.log10((p.soldCount ?? 0) + (p.views ?? 0) + 1) + (p.isBestSeller ? 1 : 0),
    };
  });

  cache = {
    builtAt: Date.now(),
    docs,
    brands: [...brands.values()],
    categories: [...categories.values()],
    building: null,
  };
  return cache;
};

/** Index of active products, rebuilt at most every 30s (cheap: a few hundred docs). */
export const getSearchIndex = async () => {
  if (cache.docs.length && Date.now() - cache.builtAt < INDEX_TTL_MS) return cache;
  if (!cache.building) cache.building = buildIndex().catch((error) => { cache.building = null; throw error; });
  return cache.building;
};

export const invalidateSearchIndex = () => {
  cache.builtAt = 0;
};

/** Ranked matches for a query: every token must match somewhere (fuzzy allowed). */
export const rankProducts = (index, query) => {
  const tokens = words(query);
  if (!tokens.length) return [];
  const phrase = normalizeText(query);

  const ranked = [];
  for (const doc of index.docs) {
    let total = 0;
    let ok = true;
    for (const token of tokens) {
      const primary = scoreToken(token, doc.primaryWords);
      const secondary = scoreToken(token, doc.secondaryWords) * 0.6;
      const score = Math.max(primary * 1.5, secondary);
      if (score <= 0) { ok = false; break; }
      total += score;
    }
    if (!ok) continue;
    if (doc.phrase.startsWith(phrase)) total += 8;
    else if (doc.phrase.includes(phrase)) total += 4;
    ranked.push({ doc, score: total + doc.popularity });
  }
  return ranked.sort((a, b) => b.score - a.score);
};

const matchEntities = (entities, query, limit) => {
  const tokens = words(query);
  if (!tokens.length) return [];
  return entities
    .map((entity) => {
      const w = [entity.nameEn, entity.nameAr].flatMap(words);
      const scores = tokens.map((t) => scoreToken(t, w));
      return { entity, score: scores.every((s) => s > 0) ? scores.reduce((a, b) => a + b, 0) : 0 };
    })
    .filter((m) => m.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((m) => m.entity);
};

const toSuggestion = (p) => ({
  id: String(p._id),
  slug: p.slug,
  nameEn: p.nameEn || p.name,
  nameAr: p.nameAr || '',
  image: p.images?.[0] ?? null,
  price: p.price,
  priceAfterDiscount: p.priceAfterDiscount ?? null,
  brand: p.brand ? { nameEn: p.brand.nameEn, nameAr: p.brand.nameAr } : null,
});

/** Autocomplete payload; an empty query returns popular products. */
export const suggest = async (query, limit = 8) => {
  const index = await getSearchIndex();
  let picked;
  if (!normalizeText(query)) {
    picked = [...index.docs].sort((a, b) => b.popularity - a.popularity).slice(0, limit).map((d) => d.product);
  } else {
    picked = rankProducts(index, query).slice(0, limit).map((r) => r.doc.product);
  }
  await refreshProductOffers(picked);
  return {
    products: picked.map(toSuggestion),
    brands: matchEntities(index.brands, query, 3),
    categories: matchEntities(index.categories, query, 3),
  };
};

/** Ordered product ids for a keyword (storefront results page). */
export const searchProductIds = async (query) => {
  const index = await getSearchIndex();
  return rankProducts(index, query).map((r) => r.doc.id);
};
