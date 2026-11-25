// src/controllers/cart.controller.js
import asyncHandler from 'express-async-handler';
import Cart from '../models/Cart.js';
import Coupon from '../models/Coupon.js';
import Product from '../models/Product.js';
import ApiError from '../utils/apiError.js';
import sendResponse from '../utils/apiResponse.js';
import { getCartSubtotal, getStoreCreditBalance, computeStoreCreditApplied } from './order.controller.js';
import { refreshProductOffers, resolveProductPrice } from '../utils/productOffer.js';

const PRODUCT_CART_SELECT = 'name nameEn nameAr slug images price priceAfterDiscount offerEndsAt stock isActive';

/** Max distinct lines accepted from a guest cart (preview/merge). */
const GUEST_CART_MAX_LINES = 50;

// --- coupon validation (single source of truth — order.controller.js reuses assertCouponApplicable) ---

/** Compute coupon discount amount capped at the cart subtotal (0 for freeShipping) */
export const calculateCouponDiscount = (coupon, subtotal) => {
  if (!coupon || coupon.discountType === 'freeShipping') return 0;

  const raw =
    coupon.discountType === 'percentage'
      ? (subtotal * coupon.discountValue) / 100
      : coupon.discountValue;

  return Math.round(Math.min(raw, subtotal) * 100) / 100;
};

/** True when coupon waives regional shipping fees */
export const isFreeShippingCoupon = (coupon) => coupon?.discountType === 'freeShipping';

/** Return an ApiError if the coupon cannot be applied; otherwise null */
export const assertCouponApplicable = (coupon, userId, subtotal) => {
  if (!coupon?.isActive) return new ApiError('Invalid or inactive coupon', 400);
  if (coupon.expiresAt && coupon.expiresAt < new Date())
    return new ApiError('Coupon has expired', 400);
  if (coupon.maxUsage != null && coupon.usageCount >= coupon.maxUsage)
    return new ApiError('Coupon usage limit has been reached', 400);

  const alreadyUsed =
    userId && coupon.usedBy?.some((id) => id.toString() === userId.toString());
  if (alreadyUsed) return new ApiError('You have already used this coupon', 400);

  if (subtotal <= 0) return new ApiError('Cart is empty', 400);

  if (subtotal < (coupon.minOrderAmount || 0)) {
    return new ApiError(
      `Minimum order amount for this coupon is ${coupon.minOrderAmount} EGP`,
      400
    );
  }

  return null;
};

/** Find an active coupon by its uppercase code */
const findActiveCouponByCode = (code) =>
  Coupon.findOne({ code: String(code).toUpperCase(), isActive: true });

// --- cart pricing/formatting ---

/** Shape cart + pricing fields for API responses */
const formatCartResponse = (result) => ({
  _id: result.cart._id,
  items: result.cart.items,
  couponCode: result.cart.couponCode,
  discountType: result.discountType ?? null,
  // 10 for a 10% coupon / EGP for a fixed one — lets the UI show "10% off".
  discountValue: result.discountValue ?? null,
  freeShipping: Boolean(result.freeShipping),
  discountAmount: result.cart.discountAmount,
  storeCreditBalance: result.storeCreditBalance ?? 0,
  storeCreditApplied: result.storeCreditApplied ?? 0,
  subtotal: result.subtotal,
  totalPrice: result.totalPrice,
});

/** Refresh item prices, coupon validity, and store-credit totals for a user's cart */
const getUpdatedCart = async (userId) => {
  const cart = await Cart.findOne({ user: userId }).populate(
    'items.product',
    PRODUCT_CART_SELECT
  );
  if (!cart) return null;

  let changed = false;

  // Lines whose product was deleted populate to null; drop them so clients never see a dangling line.
  const liveItems = cart.items.filter((item) => item.product);
  if (liveItems.length !== cart.items.length) {
    cart.items = liveItems;
    changed = true;
  }

  const cartProducts = cart.items.map((item) => item.product).filter(Boolean);
  await refreshProductOffers(cartProducts);

  for (const item of cart.items) {
    if (!item.product) continue;
    const currentPrice = resolveProductPrice(item.product);
    if (item.price !== currentPrice) {
      item.price = currentPrice;
      changed = true;
    }
  }

  const subtotal = getCartSubtotal(cart);
  let discountType = null;
  let discountValue = null;
  let freeShipping = false;

  if (cart.couponId) {
    const coupon = await Coupon.findById(cart.couponId);

    if (assertCouponApplicable(coupon, userId, subtotal)) {
      cart.couponCode = null;
      cart.couponId = null;
      cart.discountAmount = 0;
      changed = true;
    } else {
      discountType = coupon.discountType;
      discountValue = coupon.discountValue;
      freeShipping = isFreeShippingCoupon(coupon);
      const discount = calculateCouponDiscount(coupon, subtotal);
      if (cart.discountAmount !== discount) {
        cart.discountAmount = discount;
        changed = true;
      }
    }
  }

  if (changed) await cart.save();

  const finalSubtotal = getCartSubtotal(cart);
  const couponDiscount = cart.discountAmount || 0;
  const payableBeforeCredit = Math.max(0, finalSubtotal - couponDiscount);
  const storeCreditBalance = await getStoreCreditBalance(userId);
  const { storeCreditApplied, payableAfterCredit } = computeStoreCreditApplied(
    storeCreditBalance,
    payableBeforeCredit
  );

  return {
    cart,
    subtotal: finalSubtotal,
    storeCreditBalance,
    storeCreditApplied,
    totalPrice: payableAfterCredit,
    discountType,
    discountValue,
    freeShipping,
  };
};

// --- guest cart helpers ---

/** Normalize `[{ productId, quantity }]` from a guest (localStorage) cart. */
const normalizeGuestItems = (rawItems) => {
  const merged = new Map();
  for (const raw of Array.isArray(rawItems) ? rawItems : []) {
    const productId = String(raw?.productId ?? '').trim();
    const quantity = Math.floor(Number(raw?.quantity));
    if (!/^[a-f\d]{24}$/i.test(productId) || !Number.isFinite(quantity) || quantity < 1) continue;
    merged.set(productId, (merged.get(productId) ?? 0) + quantity);
    if (merged.size >= GUEST_CART_MAX_LINES) break;
  }
  return [...merged.entries()].map(([productId, quantity]) => ({ productId, quantity }));
};

// --- handlers ---

/**
 * @desc    Price a guest cart (no account) with live offer prices.
 *          Line `_id` is the product id so the client can address lines without a server cart.
 *          Lines are clamped to stock; inactive/missing products are dropped.
 * @route   POST /api/v1/cart/preview
 * @access  Public
 */
/** Price guest lines with live offers, clamped to stock (shared by cart + coupon previews). */
const priceGuestLines = async (rawItems) => {
  const items = normalizeGuestItems(rawItems);
  const products = items.length
    ? await Product.find({ _id: { $in: items.map((i) => i.productId) }, isActive: true })
        .select(PRODUCT_CART_SELECT)
        .lean()
    : [];
  await refreshProductOffers(products);
  const byId = new Map(products.map((p) => [String(p._id), p]));

  const lines = [];
  for (const { productId, quantity } of items) {
    const product = byId.get(productId);
    if (!product || product.stock <= 0) continue;
    lines.push({
      _id: productId,
      product,
      quantity: Math.min(quantity, product.stock),
      price: resolveProductPrice(product),
    });
  }
  const subtotal = Math.round(lines.reduce((sum, l) => sum + l.price * l.quantity, 0) * 100) / 100;
  return { lines, subtotal };
};

export const previewGuestCart = asyncHandler(async (req, res) => {
  const { lines, subtotal } = await priceGuestLines(req.body?.items);

  sendResponse(res, {
    message: 'Guest cart priced successfully',
    data: {
      items: lines,
      couponCode: null,
      discountType: null,
      freeShipping: false,
      discountAmount: 0,
      storeCreditBalance: 0,
      storeCreditApplied: 0,
      subtotal,
      totalPrice: subtotal,
    },
  });
});

/**
 * @desc    Show a guest how much a promo code would save — WITHOUT consuming it.
 *          Usage (usageCount / usedBy) is only recorded when an order is actually placed
 *          (commitCouponUsage after checkout), so previewing never burns a code.
 *          Per-customer reuse can't be checked without an account; it is enforced at checkout.
 * @route   POST /api/v1/cart/coupon/preview
 * @access  Public
 */
export const previewGuestCoupon = asyncHandler(async (req, res, next) => {
  const code = String(req.body?.code ?? '').trim();
  if (!code || code.length > 40) return next(new ApiError('Enter a valid promo code', 400));

  const { subtotal } = await priceGuestLines(req.body?.items);
  const coupon = await findActiveCouponByCode(code);
  const problem = assertCouponApplicable(coupon, null, subtotal);
  if (problem) return next(problem);

  const discountAmount = calculateCouponDiscount(coupon, subtotal);
  sendResponse(res, {
    message: 'Coupon is valid',
    data: {
      couponCode: coupon.code,
      discountType: coupon.discountType,
      // 10 for a 10% coupon, or the fixed EGP amount — lets the UI show "10% off".
      discountValue: coupon.discountValue,
      freeShipping: isFreeShippingCoupon(coupon),
      discountAmount,
      subtotal,
      totalPrice: Math.max(0, Math.round((subtotal - discountAmount) * 100) / 100),
    },
  });
});

/**
 * @desc    Merge a guest cart into the signed-in user's cart (after login/register).
 *          Quantities add up and are clamped to stock; bad lines are skipped, never fatal.
 * @route   POST /api/v1/cart/merge
 * @access  Private
 */
export const mergeGuestCart = asyncHandler(async (req, res) => {
  const items = normalizeGuestItems(req.body?.items);

  if (items.length) {
    const products = await Product.find({
      _id: { $in: items.map((i) => i.productId) },
      isActive: true,
    }).select('price priceAfterDiscount offerEndsAt stock isActive');
    const byId = new Map(products.map((p) => [String(p._id), p]));

    let cart = await Cart.findOne({ user: req.user._id });
    if (!cart) cart = new Cart({ user: req.user._id, items: [] });

    for (const { productId, quantity } of items) {
      const product = byId.get(productId);
      if (!product || product.stock <= 0) continue;
      const existing = cart.items.find((item) => item.product.toString() === productId);
      const nextQty = Math.min((existing?.quantity ?? 0) + quantity, product.stock);
      if (existing) {
        existing.quantity = nextQty;
        existing.price = resolveProductPrice(product);
      } else {
        cart.items.push({ product: productId, quantity: nextQty, price: resolveProductPrice(product) });
      }
    }

    if (cart.items.length) await cart.save();
  }

  const result = await getUpdatedCart(req.user._id);
  sendResponse(res, {
    message: 'Cart merged successfully',
    data: result
      ? formatCartResponse(result)
      : {
          items: [],
          subtotal: 0,
          discountAmount: 0,
          storeCreditBalance: 0,
          storeCreditApplied: 0,
          totalPrice: 0,
          couponCode: null,
          discountType: null,
          freeShipping: false,
        },
  });
});

/**
 * @desc    Get the current user's cart
 * @route   GET /api/v1/cart
 * @access  Private
 */
export const getCart = asyncHandler(async (req, res) => {
  const result = await getUpdatedCart(req.user._id);

  if (!result) {
    const storeCreditBalance = await getStoreCreditBalance(req.user._id);
    return sendResponse(res, {
      message: 'Cart retrieved successfully',
      data: {
        items: [],
        subtotal: 0,
        discountAmount: 0,
        storeCreditBalance,
        storeCreditApplied: 0,
        totalPrice: 0,
        couponCode: null,
        discountType: null,
        freeShipping: false,
      },
    });
  }

  sendResponse(res, {
    message: 'Cart retrieved successfully',
    data: formatCartResponse(result),
  });
});

/**
 * @desc    Add a product to the cart
 * @route   POST /api/v1/cart
 * @access  Private
 */
export const addToCart = asyncHandler(async (req, res, next) => {
  const { productId, quantity = 1 } = req.body;

  const product = await Product.findById(productId);
  if (!product || !product.isActive) return next(new ApiError('Product not found', 404));
  if (product.stock < quantity) return next(new ApiError('Not enough stock', 400));

  let cart = await Cart.findOne({ user: req.user._id });

  if (!cart) {
    cart = await Cart.create({
      user: req.user._id,
      items: [
        {
          product: productId,
          quantity,
          price: resolveProductPrice(product),
        },
      ],
    });
  } else {
    const existingItem = cart.items.find((item) => item.product.toString() === productId);

    if (existingItem) {
      const newQty = existingItem.quantity + quantity;
      if (product.stock < newQty) return next(new ApiError('Not enough stock', 400));
      existingItem.quantity = newQty;
      existingItem.price = resolveProductPrice(product);
    } else {
      cart.items.push({
        product: productId,
        quantity,
        price: resolveProductPrice(product),
      });
    }

    await cart.save();
  }

  const result = await getUpdatedCart(req.user._id);

  sendResponse(res, {
    statusCode: 201,
    message: 'Item added to cart',
    data: formatCartResponse(result),
  });
});

/**
 * @desc    Update quantity of a cart item
 * @route   PUT /api/v1/cart/:itemId
 * @access  Private
 */
export const updateCartItem = asyncHandler(async (req, res, next) => {
  const { quantity } = req.body;

  const cart = await Cart.findOne({ user: req.user._id });
  if (!cart) return next(new ApiError('Cart not found', 404));

  const item = cart.items.id(req.params.itemId);
  if (!item) return next(new ApiError('Item not found in cart', 404));

  const product = await Product.findById(item.product);
  if (!product || !product.isActive) return next(new ApiError('Product not found', 404));
  if (product.stock < quantity) return next(new ApiError('Not enough stock', 400));

  item.quantity = quantity;
  item.price = resolveProductPrice(product);
  await cart.save();

  const result = await getUpdatedCart(req.user._id);

  sendResponse(res, {
    message: 'Cart updated',
    data: formatCartResponse(result),
  });
});

/**
 * @desc    Remove an item from the cart
 * @route   DELETE /api/v1/cart/:itemId
 * @access  Private
 */
export const removeCartItem = asyncHandler(async (req, res, next) => {
  const cart = await Cart.findOne({ user: req.user._id });
  if (!cart) return next(new ApiError('Cart not found', 404));

  const item = cart.items.id(req.params.itemId);
  if (!item) return next(new ApiError('Item not found in cart', 404));

  item.deleteOne();
  await cart.save();

  const result = await getUpdatedCart(req.user._id);

  sendResponse(res, {
    message: 'Item removed from cart',
    data: formatCartResponse(result),
  });
});

/**
 * @desc    Clear the entire cart
 * @route   DELETE /api/v1/cart
 * @access  Private
 */
export const clearCart = asyncHandler(async (req, res) => {
  await Cart.findOneAndDelete({ user: req.user._id });
  sendResponse(res, { message: 'Cart cleared' });
});

/**
 * @desc    Apply a coupon to the cart
 * @route   POST /api/v1/cart/coupon
 * @access  Private
 */
export const applyCoupon = asyncHandler(async (req, res, next) => {
  const { code } = req.body;

  const coupon = await findActiveCouponByCode(code);
  if (!coupon) return next(new ApiError('Invalid or inactive coupon', 400));

  const cart = await Cart.findOne({ user: req.user._id });
  if (!cart?.items.length) return next(new ApiError('Cart is empty', 400));

  const subtotal = getCartSubtotal(cart);
  const validationError = assertCouponApplicable(coupon, req.user._id, subtotal);
  if (validationError) return next(validationError);

  cart.couponCode = coupon.code;
  cart.couponId = coupon._id;
  cart.discountAmount = calculateCouponDiscount(coupon, subtotal);
  await cart.save();

  const result = await getUpdatedCart(req.user._id);

  sendResponse(res, {
    message: 'Coupon applied to cart successfully',
    data: formatCartResponse(result),
  });
});

/**
 * @desc    Remove the applied coupon from the cart
 * @route   DELETE /api/v1/cart/coupon
 * @access  Private
 */
export const removeCoupon = asyncHandler(async (req, res, next) => {
  const cart = await Cart.findOne({ user: req.user._id });
  if (!cart) return next(new ApiError('Cart not found', 404));

  cart.couponCode = null;
  cart.couponId = null;
  cart.discountAmount = 0;
  await cart.save();

  const result = await getUpdatedCart(req.user._id);

  sendResponse(res, {
    message: 'Coupon removed from cart successfully',
    data: {
      ...formatCartResponse(result),
      couponCode: null,
      discountAmount: 0,
    },
  });
});
