// src/controllers/cart.controller.js
import asyncHandler from 'express-async-handler';
import Cart from '../models/Cart.js';
import Product from '../models/Product.js';
import Coupon from '../models/Coupon.js';
import ApiError from '../utils/apiError.js';
import sendResponse from '../utils/apiResponse.js';
import {
  assertCouponApplicable,
  calculateCouponDiscount,
  findActiveCouponByCode,
  isCouponValidForCart,
} from '../utils/couponHelpers.js';

const resolveProductPrice = (product) => product.priceAfterDiscount ?? product.price;

const getCartSubtotal = (cart) =>
  cart.items.reduce((sum, item) => sum + item.price * item.quantity, 0);

const formatCartResponse = (result) => ({
  _id: result.cart._id,
  items: result.cart.items,
  couponCode: result.cart.couponCode,
  discountAmount: result.cart.discountAmount,
  subtotal: result.subtotal,
  totalPrice: result.totalPrice,
});

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

  if (cart.couponId) {
    const coupon = await Coupon.findById(cart.couponId);

    if (!isCouponValidForCart(coupon, userId, subtotal)) {
      cart.couponCode = null;
      cart.couponId = null;
      cart.discountAmount = 0;
      changed = true;
    } else {
      const discount = calculateCouponDiscount(coupon, subtotal);
      if (cart.discountAmount !== discount) {
        cart.discountAmount = discount;
        changed = true;
      }
    }
  }

  if (changed) await cart.save();

  const finalSubtotal = getCartSubtotal(cart);
  const totalPrice = Math.max(0, finalSubtotal - (cart.discountAmount || 0));

  return { cart, subtotal: finalSubtotal, totalPrice };
};

export const getCart = asyncHandler(async (req, res) => {
  const result = await getUpdatedCart(req.user._id);

  if (!result) {
    return sendResponse(res, {
      message: 'Cart retrieved successfully',
      data: { items: [], subtotal: 0, discountAmount: 0, totalPrice: 0, couponCode: null },
    });
  }

  sendResponse(res, {
    message: 'Cart retrieved successfully',
    data: formatCartResponse(result),
  });
});

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

export const clearCart = asyncHandler(async (req, res) => {
  await Cart.findOneAndDelete({ user: req.user._id });
  sendResponse(res, { message: 'Cart cleared' });
});

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
