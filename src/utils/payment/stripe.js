// src/utils/payment/stripe.js
import Stripe from 'stripe';
import ApiError from '../apiError.js';
import { toMinorUnits } from '../checkoutHelpers.js';
import { assertPaymentSessionForFulfillment, fulfillPaymentSession } from './session.js';

let stripe;

const getStripe = () => {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new ApiError('Stripe is not configured', 503);
  }
  if (!stripe) stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  return stripe;
};

const paymentIntentId = (value) => {
  if (!value) return null;
  return typeof value === 'string' ? value : value.id;
};

export const createStripeCheckoutSession = async ({ paymentSessionId, totalPrice, userEmail }) => {
  const successUrl = process.env.STRIPE_SUCCESS_URL;
  const cancelUrl = process.env.STRIPE_CANCEL_URL;
  if (!successUrl || !cancelUrl) {
    throw new ApiError('Stripe redirect URLs are not configured', 503);
  }

  const session = await getStripe().checkout.sessions.create({
    mode: 'payment',
    customer_email: userEmail,
    line_items: [
      {
        price_data: {
          currency: (process.env.STRIPE_CURRENCY || 'egp').toLowerCase(),
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

  return { providerSessionId: session.id, url: session.url };
};

export const constructStripeEvent = (rawBody, signature) => {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new ApiError('Stripe webhook secret is not configured', 503);
  return getStripe().webhooks.constructEvent(rawBody, signature, secret);
};

const resolveCheckoutPaymentReference = async (session) => {
  const fromEvent = paymentIntentId(session.payment_intent);
  if (fromEvent) return fromEvent;

  const full = await getStripe().checkout.sessions.retrieve(session.id);
  return paymentIntentId(full.payment_intent) || session.id;
};

export const resolveStripePaymentIntentId = async (paymentReference) => {
  if (!paymentReference) throw new ApiError('No payment reference on order', 400);
  if (paymentReference.startsWith('pi_')) return paymentReference;

  if (paymentReference.startsWith('cs_')) {
    const session = await getStripe().checkout.sessions.retrieve(paymentReference);
    const id = paymentIntentId(session.payment_intent);
    if (!id) throw new ApiError('Checkout session has no payment intent', 400);
    return id;
  }

  throw new ApiError('Unsupported payment reference for Stripe refund', 400);
};

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

export const handleStripeWebhookEvent = async (event) => {
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const paymentSessionId = session.metadata?.paymentSessionId;
    if (!paymentSessionId) return;

    await assertPaymentSessionForFulfillment(paymentSessionId, { provider: 'stripe' });
    const paymentReference = await resolveCheckoutPaymentReference(session);
    await fulfillPaymentSession(paymentSessionId, paymentReference);
    return;
  }

  if (event.type === 'charge.refunded') {
    const charge = event.data.object;
    if (!charge.refunded) return;

    const { syncOrderRefundedFromStripe } = await import('../orderRefundHelpers.js');
    const pi =
      typeof charge.payment_intent === 'string'
        ? charge.payment_intent
        : charge.payment_intent?.id;
    await syncOrderRefundedFromStripe(pi);
  }
};
