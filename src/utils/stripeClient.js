// src/utils/stripeClient.js
import Stripe from 'stripe';
import ApiError from './apiError.js';
import { toMinorUnits } from './checkoutHelpers.js';

let stripe;

const getStripe = () => {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new ApiError('Stripe is not configured', 503);
  }
  if (!stripe) {
    stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  }
  return stripe;
};

/**
 * @param {{ paymentSessionId: string, totalPrice: number, userEmail: string }} params
 */
export const createStripeCheckoutSession = async ({
  paymentSessionId,
  totalPrice,
  userEmail,
}) => {
  const successUrl = process.env.STRIPE_SUCCESS_URL;
  const cancelUrl = process.env.STRIPE_CANCEL_URL;
  if (!successUrl || !cancelUrl) {
    throw new ApiError('Stripe redirect URLs are not configured', 503);
  }

  const currency = (process.env.STRIPE_CURRENCY || 'egp').toLowerCase();

  const session = await getStripe().checkout.sessions.create({
    mode: 'payment',
    customer_email: userEmail,
    line_items: [
      {
        price_data: {
          currency,
          product_data: { name: 'Oxxila order' },
          unit_amount: toMinorUnits(totalPrice),
        },
        quantity: 1,
      },
    ],
    metadata: { paymentSessionId },
    success_url: `${successUrl}?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: cancelUrl,
  });

  return { sessionId: session.id, url: session.url };
};

export const constructStripeEvent = (rawBody, signature) => {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    throw new ApiError('Stripe webhook secret is not configured', 503);
  }
  return getStripe().webhooks.constructEvent(rawBody, signature, secret);
};

const normalizePaymentIntentId = (value) => {
  if (!value) return null;
  return typeof value === 'string' ? value : value.id;
};

/** Resolves Checkout Session id (cs_) to PaymentIntent id (pi_). */
export const resolveStripePaymentIntentId = async (paymentReference) => {
  if (!paymentReference) {
    throw new ApiError('No payment reference on order', 400);
  }
  if (paymentReference.startsWith('pi_')) {
    return paymentReference;
  }
  if (paymentReference.startsWith('cs_')) {
    const session = await getStripe().checkout.sessions.retrieve(paymentReference);
    const paymentIntentId = normalizePaymentIntentId(session.payment_intent);
    if (!paymentIntentId) {
      throw new ApiError('Checkout session has no payment intent', 400);
    }
    return paymentIntentId;
  }
  throw new ApiError('Unsupported payment reference for Stripe refund', 400);
};

/**
 * @param {{ paymentIntentId: string, amount?: number }} params — amount in minor units (partial refund)
 */
export const createStripeRefund = async ({ paymentIntentId, amount }) => {
  try {
    const params = { payment_intent: paymentIntentId };
    if (amount != null) params.amount = amount;
    return await getStripe().refunds.create(params);
  } catch (err) {
    if (err.type === 'StripeInvalidRequestError') {
      throw new ApiError(err.message, 400);
    }
    throw new ApiError('Stripe refund failed', 502);
  }
};

/** Prefer PaymentIntent id for refunds; falls back to retrieving the Checkout Session. */
export const resolveCheckoutPaymentReference = async (session) => {
  const fromEvent = normalizePaymentIntentId(session.payment_intent);
  if (fromEvent) return fromEvent;

  const full = await getStripe().checkout.sessions.retrieve(session.id);
  return normalizePaymentIntentId(full.payment_intent) || session.id;
};
