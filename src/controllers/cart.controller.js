// src/controllers/cart.controller.js
import asyncHandler from 'express-async-handler';
import Cart from '../models/Cart.js';
import Coupon from '../models/Coupon.js';
import Product from '../models/Product.js';
import ApiError from '../utils/apiError.js';
import sendResponse from '../utils/apiResponse.js';
import { getCartSubtotal, getStoreCreditBalance, computeStoreCreditApplied } from './order.controller.js';

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

/** Resolve the effective unit price (discounted when present) */
const resolveProductPrice = (product) => product.priceAfterDiscount ?? product.price;

/** Shape cart + pricing fields for API responses */
const formatCartResponse = (result) => ({
  _id: result.cart._id,
  items: result.cart.items,
  couponCode: result.cart.couponCode,
  discountType: result.discountType ?? null,
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
    'name images price priceAfterDiscount stock isActive'
  );
  if (!cart) return null;

  let changed = false;
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
    freeShipping,
  };
};

// --- handlers ---

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
