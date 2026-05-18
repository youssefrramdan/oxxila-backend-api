// src/utils/checkoutHelpers.js
import mongoose from 'mongoose';
import Cart from '../models/Cart.js';
import Product from '../models/Product.js';
import Order from '../models/Order.js';
import Governorate from '../models/Governorate.js';
import District from '../models/District.js';
import Coupon from '../models/Coupon.js';
import ApiError from './apiError.js';
import resolveShipping from './resolveShipping.js';
import { isCouponValidForCart, commitCouponUsage } from './couponHelpers.js';
import { decrementStockForOrderItems } from './orderStockHelpers.js';

export const getCartSubtotal = (items) =>
  items.reduce((sum, item) => sum + item.price * item.quantity, 0);

export const toMinorUnits = (amount) => Math.round(amount * 100);

const mapCartItemsToOrderItems = (cartItems) => {
  const orderItems = [];

  for (const item of cartItems) {
    const product = item.product;
    if (!product?.isActive) {
      throw new ApiError(`Product is no longer available: ${item.product?._id ?? 'unknown'}`, 400);
    }
    if (product.stock < item.quantity) {
      throw new ApiError(`Not enough stock for "${product.name}"`, 400);
    }

    orderItems.push({
      product: product._id,
      name: product.name,
      image: product.images?.[0] ?? null,
      price: item.price,
      quantity: item.quantity,
    });
  }

  return orderItems;
};

export const buildShippingSnapshot = async ({ governorateId, districtId, addressLine }) => {
  const governorate = await Governorate.findById(governorateId).populate(
    'country',
    'name isActive'
  );
  if (!governorate?.isActive) {
    throw new ApiError('Governorate not found', 404);
  }
  if (!governorate.country?.isActive) {
    throw new ApiError('Country is not available for shipping', 400);
  }

  const { shippingPrice, isOther } = await resolveShipping({ governorateId, districtId });

  let districtName = 'Other';
  let storedDistrictId = null;

  if (!isOther && districtId && districtId !== 'other') {
    const district = await District.findById(districtId);
    if (district) {
      districtName = district.name;
      storedDistrictId = district._id;
    }
  }

  return {
    shippingPrice,
    shippingAddress: {
      countryName: governorate.country.name,
      governorateName: governorate.name,
      districtName,
      addressLine: addressLine.trim(),
      isOther,
      countryId: governorate.country._id,
      governorateId: governorate._id,
      districtId: storedDistrictId,
    },
  };
};

export const prepareCheckoutFromCart = async (userId, addressInput) => {
  const cart = await Cart.findOne({ user: userId });
  if (!cart?.items?.length) {
    throw new ApiError('Cart is empty', 400);
  }

  const populated = await Cart.findById(cart._id).populate(
    'items.product',
    'name images price priceAfterDiscount stock isActive'
  );

  const orderItems = mapCartItemsToOrderItems(populated.items);
  const subtotal = getCartSubtotal(populated.items);

  let discountAmount = populated.discountAmount || 0;
  let couponCode = populated.couponCode;
  let couponId = populated.couponId;

  if (couponId) {
    const coupon = await Coupon.findById(couponId);
    if (!isCouponValidForCart(coupon, userId, subtotal)) {
      throw new ApiError('Cart coupon is no longer valid. Remove it and try again.', 400);
    }
  } else {
    discountAmount = 0;
    couponCode = null;
  }

  const { shippingPrice, shippingAddress } = await buildShippingSnapshot(addressInput);
  const totalPrice = Math.max(0, subtotal - discountAmount + shippingPrice);

  return {
    cartId: cart._id,
    orderItems,
    subtotal,
    shippingPrice,
    shippingAddress,
    discountAmount,
    totalPrice,
    couponCode,
    couponId,
  };
};

/**
 * Creates the order, decrements stock, clears cart, commits coupon usage.
 * `snapshot` — checkout prep result or PaymentSession document (`items` or `orderItems`).
 */
export const fulfillCheckout = async (snapshot, payment) => {
  const userId = snapshot.user ?? snapshot.userId;
  const items = snapshot.orderItems ?? snapshot.items;
  const {
    shippingAddress,
    subtotal,
    shippingPrice,
    discountAmount,
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
            items,
            shippingAddress,
            subtotal,
            shippingPrice,
            discountAmount,
            totalPrice,
            couponCode,
            couponId,
            paymentMethod: payment.method,
            paymentStatus: payment.status,
            paymentProvider: payment.provider ?? null,
            paymentReference: payment.reference ?? null,
            orderStatus: 'pending',
          },
        ],
        { session }
      );

      await Cart.deleteOne({ user: userId }, { session });
    });

    if (couponId) {
      await commitCouponUsage(couponId, userId);
    }

    return order;
  } finally {
    session.endSession();
  }
};
