// src/utils/cartPricing.js
import Cart from '../models/Cart.js';
import Coupon from '../models/Coupon.js';
import {
  calculateCouponDiscount,
  isCouponValidForCart,
} from './couponHelpers.js';
import {
  computeStoreCreditApplied,
  getStoreCreditBalance,
} from './storeCredit.js';

export const resolveProductPrice = (product) => product.priceAfterDiscount ?? product.price;

export const getCartSubtotal = (cart) =>
  cart.items.reduce((sum, item) => sum + item.price * item.quantity, 0);

export const formatCartResponse = (result) => ({
  _id: result.cart._id,
  items: result.cart.items,
  couponCode: result.cart.couponCode,
  discountAmount: result.cart.discountAmount,
  storeCreditBalance: result.storeCreditBalance ?? 0,
  storeCreditApplied: result.storeCreditApplied ?? 0,
  subtotal: result.subtotal,
  totalPrice: result.totalPrice,
});

export const getUpdatedCart = async (userId) => {
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
  };
};
