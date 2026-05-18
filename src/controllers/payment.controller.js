// src/controllers/payment.controller.js
import asyncHandler from 'express-async-handler';
import PaymentSession from '../models/PaymentSession.js';
import ApiError from '../utils/apiError.js';
import sendResponse from '../utils/apiResponse.js';
import { prepareCheckoutFromCart } from '../utils/checkoutHelpers.js';
import { constructStripeEvent, resolveCheckoutPaymentReference } from '../utils/stripeClient.js';
import { syncOrderRefundedFromStripe } from '../utils/orderRefundHelpers.js';
import {
  buildPaymobReturnUrl,
  parsePaymobResponseQuery,
  verifyPaymobProcessedHmac,
} from '../utils/paymobClient.js';
import { fulfillPaymentSession } from '../utils/paymentFulfillment.js';
import { paymentProviderHandlers } from '../utils/paymentProviders.js';

const PAYMENT_SESSION_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * @desc    Start card checkout — creates provider session; order is created on webhook success
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

  const expiresAt = new Date(Date.now() + PAYMENT_SESSION_TTL_MS);

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
    expiresAt,
  });

  const startProvider = paymentProviderHandlers[provider];
  if (!startProvider) {
    return next(new ApiError('Invalid payment provider', 400));
  }

  const providerData = await startProvider({ paymentSession, checkout, user: req.user });

  sendResponse(res, {
    statusCode: 201,
    message: 'Payment session created successfully',
    data: {
      paymentSessionId: paymentSession._id,
      provider,
      totalPrice: checkout.totalPrice,
      expiresAt,
      ...providerData,
    },
  });
});

/**
 * @desc    Stripe webhook — checkout.session.completed, charge.refunded
 * @route   POST /api/v1/webhooks/stripe
 * @access  Public (signed)
 */
export const stripeWebhook = asyncHandler(async (req, res) => {
  const signature = req.headers['stripe-signature'];
  const event = constructStripeEvent(req.body, signature);

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const paymentSessionId = session.metadata?.paymentSessionId;

    if (paymentSessionId) {
      const paymentReference = await resolveCheckoutPaymentReference(session);
      await fulfillPaymentSession(paymentSessionId, paymentReference);
    }
  }

  if (event.type === 'charge.refunded') {
    const charge = event.data.object;
    if (charge.refunded) {
      const paymentIntentId =
        typeof charge.payment_intent === 'string'
          ? charge.payment_intent
          : charge.payment_intent?.id;
      await syncOrderRefundedFromStripe(paymentIntentId);
    }
  }

  res.status(200).json({ received: true });
});

const handlePaymobTransaction = async (obj, hmac, next) => {
  if (!verifyPaymobProcessedHmac(obj, hmac)) {
    next(new ApiError('Invalid Paymob signature', 400));
    return false;
  }

  if (!obj.success) {
    if (obj.order?.merchant_order_id) {
      await PaymentSession.updateOne(
        { _id: obj.order.merchant_order_id, status: 'pending' },
        { status: 'failed' }
      );
    }
    return true;
  }

  const paymentSessionId = obj.order?.merchant_order_id;
  if (paymentSessionId) {
    await fulfillPaymentSession(paymentSessionId, String(obj.id));
  }
  return true;
};

/**
 * @desc    Paymob processed callback (server POST)
 * @route   POST /api/v1/webhooks/paymob
 * @access  Public (HMAC)
 */
export const paymobWebhook = asyncHandler(async (req, res, next) => {
  const { type, obj } = req.body;

  if (type !== 'TRANSACTION' || !obj) {
    return res.status(200).json({ received: true });
  }

  const handled = await handlePaymobTransaction(obj, req.body.hmac, next);
  if (!handled) return;
  res.status(200).json({ received: true });
});

/**
 * @desc    Paymob response callback (browser GET redirect after payment)
 * @route   GET /api/v1/webhooks/paymob
 * @access  Public (HMAC)
 */
export const paymobRedirect = asyncHandler(async (req, res, next) => {
  const { obj, hmac } = parsePaymobResponseQuery(req.query);

  if (!obj?.id) {
    return next(new ApiError('Invalid Paymob callback', 400));
  }

  const handled = await handlePaymobTransaction(obj, hmac, next);
  if (!handled) return;

  const returnUrl = buildPaymobReturnUrl({
    success: obj.success,
    merchantOrderId: obj.order?.merchant_order_id,
  });
  res.redirect(302, returnUrl);
});

/**
 * @desc    Poll payment session status (after redirect)
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
