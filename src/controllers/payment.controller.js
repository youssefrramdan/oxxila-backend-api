// src/controllers/payment.controller.js
import asyncHandler from 'express-async-handler';
import PaymentSession from '../models/PaymentSession.js';
import ApiError from '../utils/apiError.js';
import sendResponse from '../utils/apiResponse.js';
import { prepareCheckoutFromCart } from '../utils/checkoutHelpers.js';
import { PAYMENT_SESSION_TTL_MS } from '../utils/payment/constants.js';
import { paymentProviders } from '../utils/payment/providers.js';
import {
  buildPaymobReturnUrl,
  parsePaymobRedirectQuery,
  processPaymobTransaction,
} from '../utils/payment/paymob.js';
import { constructStripeEvent, handleStripeWebhookEvent } from '../utils/payment/stripe.js';

/**
 * @desc    Start card checkout — order is created on provider webhook success
 * @route   POST /api/v1/orders/payment-session
 * @access  Private
 */
export const createPaymentSession = asyncHandler(async (req, res, next) => {
  const { governorateId, districtId, addressLine, provider } = req.body;
  const userId = req.user._id;

  const checkout = await prepareCheckoutFromCart(userId, {
    governorateId,
    districtId,
    addressLine,
  });

  const paymentSession = await PaymentSession.create({
    user: userId,
    items: checkout.orderItems,
    shippingAddress: checkout.shippingAddress,
    subtotal: checkout.subtotal,
    shippingPrice: checkout.shippingPrice,
    discountAmount: checkout.discountAmount,
    totalPrice: checkout.totalPrice,
    couponCode: checkout.couponCode,
    couponId: checkout.couponId,
    provider,
    providerSessionId: 'pending',
    status: 'pending',
    expiresAt: new Date(Date.now() + PAYMENT_SESSION_TTL_MS),
  });

  const startProvider = paymentProviders[provider];
  if (!startProvider) return next(new ApiError('Invalid payment provider', 400));

  let providerPayload;
  try {
    providerPayload = await startProvider({
      paymentSession,
      totalPrice: checkout.totalPrice,
      user: req.user,
    });
  } catch (err) {
    await PaymentSession.deleteOne({ _id: paymentSession._id });
    throw err;
  }

  sendResponse(res, {
    statusCode: 201,
    message: 'Payment session created successfully',
    data: {
      paymentSessionId: paymentSession._id,
      provider,
      totalPrice: checkout.totalPrice,
      expiresAt: paymentSession.expiresAt,
      ...providerPayload,
    },
  });
});

/**
 * @desc    Stripe webhook
 * @route   POST /api/v1/webhooks/stripe
 */
export const stripeWebhook = asyncHandler(async (req, res) => {
  const event = constructStripeEvent(req.body, req.headers['stripe-signature']);
  await handleStripeWebhookEvent(event);
  res.status(200).json({ received: true });
});

/**
 * @desc    Paymob processed callback (POST)
 * @route   POST /api/v1/webhooks/paymob
 */
export const paymobWebhook = asyncHandler(async (req, res) => {
  const { type, obj, hmac } = req.body;
  if (type === 'TRANSACTION' && obj) {
    await processPaymobTransaction(obj, hmac);
  }
  res.status(200).json({ received: true });
});

/**
 * @desc    Paymob response callback (GET redirect)
 * @route   GET /api/v1/webhooks/paymob
 */
export const paymobRedirect = asyncHandler(async (req, res, next) => {
  const { obj, hmac } = parsePaymobRedirectQuery(req.query);
  if (!obj?.id) return next(new ApiError('Invalid Paymob callback', 400));

  await processPaymobTransaction(obj, hmac);

  res.redirect(
    302,
    buildPaymobReturnUrl({
      success: obj.success,
      merchantOrderId: obj.order?.merchant_order_id,
    })
  );
});

/**
 * @desc    Poll payment session status
 * @route   GET /api/v1/orders/payment-session/:id
 * @access  Private
 */
export const getPaymentSessionStatus = asyncHandler(async (req, res, next) => {
  const paymentSession = await PaymentSession.findOne({
    _id: req.params.id,
    user: req.user._id,
  }).populate('order');

  if (!paymentSession) {
    return next(new ApiError(`No payment session found with id: ${req.params.id}`, 404));
  }

  sendResponse(res, {
    message: 'Payment session retrieved successfully',
    data: {
      _id: paymentSession._id,
      status: paymentSession.status,
      provider: paymentSession.provider,
      totalPrice: paymentSession.totalPrice,
      order: paymentSession.order,
    },
  });
});
