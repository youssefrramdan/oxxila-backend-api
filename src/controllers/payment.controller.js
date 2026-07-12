// src/controllers/payment.controller.js
import crypto from 'crypto';
import Stripe from 'stripe';
import asyncHandler from 'express-async-handler';
import PaymentSession from '../models/PaymentSession.js';
import Order from '../models/Order.js';
import ApiError from '../utils/apiError.js';
import sendResponse from '../utils/apiResponse.js';
import { handleBostaWebhookPayload } from './orderShipping.controller.js';
import {
  appendUserAddress,
  fulfillCheckout,
  prepareCheckoutFromCart,
  resolveCheckoutAddressInput,
  syncOrderRefundedFromStripe,
  toMinorUnits,
} from './order.controller.js';

// How long a PaymentSession stays valid before checkout fulfillment is rejected
const PAYMENT_SESSION_TTL_MS = 24 * 60 * 60 * 1000;
// Session statuses that may still be locked for fulfillment
const ACTIVE_STATUSES = ['pending', 'processing'];
// Paymob Accept API root
const PAYMOB_BASE = 'https://accept.paymob.com/api';

/** Standard 404 for a missing payment session. */
const sessionNotFound = (id) => new ApiError(`No payment session found with id: ${id}`, 404);

/** Normalize a Stripe payment_intent field (string or expanded object) to an id. */
const paymentIntentId = (value) => (typeof value === 'string' ? value : value?.id) ?? null;

/** Coerce Paymob redirect query bools that arrive as strings. */
const parseBool = (value) => {
  if (value === true || value === false) return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return Boolean(value);
};

// ── Payment session ──

/** Patch PaymentSession status (+ optional extra fields). */
const updateSessionStatus = (id, status, extra = {}) =>
  PaymentSession.updateOne({ _id: id }, { status, ...extra });

/** Load session and assert provider (+ optional amount) match before fulfilling. */
const assertPaymentSessionForFulfillment = async (paymentSessionId, { provider, amountCents }) => {
  const session = await PaymentSession.findById(paymentSessionId);
  if (!session) throw sessionNotFound(paymentSessionId);
  if (session.provider !== provider) throw new ApiError('Payment session provider mismatch', 400);

  if (amountCents != null) {
    const expected = toMinorUnits(session.totalPrice);
    if (!Number.isFinite(amountCents) || amountCents !== expected) {
      throw new ApiError('Payment amount does not match session total', 400);
    }
  }

  return session;
};

/** Return the already-created order when session is completed (idempotent path). */
const getCompletedOrder = (session) =>
  session.status === 'completed' && session.order ? Order.findById(session.order) : null;

/** Lock session, create paid order via fulfillCheckout, mark session completed. */
const fulfillPaymentSession = async (paymentSessionId, paymentReference) => {
  const existing = await PaymentSession.findById(paymentSessionId);
  if (!existing) throw sessionNotFound(paymentSessionId);

  const completed = await getCompletedOrder(existing);
  if (completed) return completed;

  if (existing.status === 'expired' || existing.expiresAt < new Date()) {
    if (existing.status !== 'expired') await updateSessionStatus(paymentSessionId, 'expired');
    throw new ApiError('Payment session has expired', 400);
  }

  const locked = await PaymentSession.findOneAndUpdate(
    { _id: paymentSessionId, status: { $in: ACTIVE_STATUSES } },
    { status: 'processing' },
    { new: true }
  );

  if (!locked) {
    const again = await PaymentSession.findById(paymentSessionId);
    const retry = again ? await getCompletedOrder(again) : null;
    if (retry) return retry;
    throw new ApiError('Payment session is not available for fulfillment', 409);
  }

  try {
    const order = await fulfillCheckout(
      { ...locked.toObject(), userId: locked.user, orderItems: locked.items, shipping: locked.shipping },
      { method: 'card', status: 'paid', provider: locked.provider, reference: paymentReference }
    );

    await updateSessionStatus(paymentSessionId, 'completed', { order: order._id });
    return order;
  } catch (err) {
    await PaymentSession.updateOne({ _id: paymentSessionId, status: 'processing' }, { status: 'pending' });
    throw err;
  }
};

/** Shape a new PaymentSession document from prepareCheckoutFromCart output. */
const buildPaymentSessionDoc = (userId, provider, checkout) => ({
  user: userId,
  items: checkout.orderItems,
  shippingAddress: checkout.shippingAddress,
  shipping: checkout.shipping,
  subtotal: checkout.subtotal,
  shippingPrice: checkout.shippingPrice,
  discountAmount: checkout.discountAmount,
  storeCreditApplied: checkout.storeCreditApplied,
  totalPrice: checkout.totalPrice,
  couponCode: checkout.couponCode,
  couponId: checkout.couponId,
  provider,
  providerSessionId: 'pending',
  status: 'pending',
  expiresAt: new Date(Date.now() + PAYMENT_SESSION_TTL_MS),
});

// ── Stripe ──

// Lazily initialized Stripe SDK client
let stripe;

/** Return a configured Stripe client (or 503 if unset). */
const getStripe = () => {
  if (!process.env.STRIPE_SECRET_KEY) throw new ApiError('Stripe is not configured', 503);
  if (!stripe) stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  return stripe;
};

/** Create a Stripe Checkout Session for the given PaymentSession total. */
const createStripeCheckoutSession = async ({ paymentSessionId, totalPrice, userEmail }) => {
  const successUrl = process.env.STRIPE_SUCCESS_URL;
  const cancelUrl = process.env.STRIPE_CANCEL_URL;
  if (!successUrl || !cancelUrl) throw new ApiError('Stripe redirect URLs are not configured', 503);

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

/** Verify Stripe webhook signature and parse the event. */
const constructStripeEvent = (rawBody, signature) => {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new ApiError('Stripe webhook secret is not configured', 503);
  return getStripe().webhooks.constructEvent(rawBody, signature, secret);
};

/** Resolve payment intent id from a completed Checkout Session object. */
const resolveCheckoutPaymentReference = async (session) => {
  const fromEvent = paymentIntentId(session.payment_intent);
  if (fromEvent) return fromEvent;

  const full = await getStripe().checkout.sessions.retrieve(session.id);
  return paymentIntentId(full.payment_intent) || session.id;
};

/** Normalize order.paymentReference (pi_… or cs_…) to a PaymentIntent id for refunds. */
export const resolveStripePaymentIntentId = async (paymentReference) => {
  if (!paymentReference) throw new ApiError('No payment reference on order', 400);
  if (paymentReference.startsWith('pi_')) return paymentReference;

  if (!paymentReference.startsWith('cs_')) {
    throw new ApiError('Unsupported payment reference for Stripe refund', 400);
  }

  const session = await getStripe().checkout.sessions.retrieve(paymentReference);
  const id = paymentIntentId(session.payment_intent);
  if (!id) throw new ApiError('Checkout session has no payment intent', 400);
  return id;
};

/** Create a Stripe refund for a PaymentIntent (optional partial amount). */
export const createStripeRefund = async ({ paymentIntentId: piId, amount }) => {
  try {
    const params = { payment_intent: piId };
    if (amount != null) params.amount = amount;
    return await getStripe().refunds.create(params);
  } catch (err) {
    if (err.type === 'StripeInvalidRequestError') throw new ApiError(err.message, 400);
    throw new ApiError('Stripe refund failed', 502);
  }
};

/** Dispatch checkout.session.completed / charge.refunded Stripe events. */
const handleStripeWebhookEvent = async (event) => {
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const paymentSessionId = session.metadata?.paymentSessionId;
    if (!paymentSessionId) return;

    await assertPaymentSessionForFulfillment(paymentSessionId, { provider: 'stripe' });
    await fulfillPaymentSession(paymentSessionId, await resolveCheckoutPaymentReference(session));
    return;
  }

  if (event.type === 'charge.refunded') {
    const charge = event.data.object;
    if (charge.refunded) await syncOrderRefundedFromStripe(paymentIntentId(charge.payment_intent));
  }
};

// ── Paymob ──

/** POST JSON to Paymob Accept API; map non-OK responses to ApiError. */
const paymobFetch = async (path, body) => {
  const res = await fetch(`${PAYMOB_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data?.detail || data?.message || 'Paymob request failed', 502);
  return data;
};

/** Authenticate with Paymob and return an auth token. */
const getAuthToken = async () => {
  const apiKey = process.env.PAYMOB_API_KEY;
  if (!apiKey) throw new ApiError('Paymob is not configured', 503);

  const { token } = await paymobFetch('/auth/tokens', { api_key: apiKey });
  if (!token) throw new ApiError('Paymob authentication failed', 502);
  return token;
};

/** Build Paymob billing_data payload from the authenticated user. */
const paymobBillingData = (user) => {
  const [firstName, ...rest] = (user.name || 'Customer').trim().split(/\s+/);
  return {
    apartment: 'NA',
    email: user.email,
    floor: 'NA',
    first_name: firstName,
    street: 'NA',
    building: 'NA',
    phone_number: user.phone || '01000000000',
    shipping_method: 'NA',
    postal_code: 'NA',
    city: 'NA',
    country: 'EG',
    last_name: rest.join(' ') || '-',
    state: 'NA',
  };
};

/** Create Paymob order + payment key and return iframe URL. */
const createPaymobCheckout = async ({ paymentSessionId, totalPrice, user }) => {
  const integrationId = Number(process.env.PAYMOB_INTEGRATION_ID);
  const iframeId = process.env.PAYMOB_IFRAME_ID;
  if (!integrationId || !iframeId) {
    throw new ApiError('Paymob integration settings are not configured', 503);
  }

  const authToken = await getAuthToken();
  const amountCents = toMinorUnits(totalPrice);
  const currency = process.env.PAYMOB_CURRENCY || 'EGP';

  const { id: paymobOrderId } = await paymobFetch('/ecommerce/orders', {
    auth_token: authToken,
    delivery_needed: false,
    amount_cents: amountCents,
    currency,
    merchant_order_id: paymentSessionId,
    items: [],
  });

  const { token: paymentToken } = await paymobFetch('/acceptance/payment_keys', {
    auth_token: authToken,
    amount_cents: amountCents,
    expiration: 3600,
    order_id: paymobOrderId,
    billing_data: paymobBillingData(user),
    currency,
    integration_id: integrationId,
  });

  if (!paymentToken) throw new ApiError('Paymob payment key creation failed', 502);

  return {
    providerSessionId: String(paymobOrderId),
    iframeUrl: `${PAYMOB_BASE}/acceptance/iframes/${iframeId}?payment_token=${paymentToken}`,
  };
};

// Paymob redirect query keys that arrive as "true"/"false" strings
const PAYMOB_REDIRECT_BOOL_KEYS = [
  'pending',
  'success',
  'is_auth',
  'is_capture',
  'is_standalone_payment',
  'is_voided',
  'is_refunded',
  'is_3d_secure',
  'has_parent_transaction',
  'error_occured',
];

/** Flatten Paymob GET redirect query into the same obj shape as the POST webhook. */
const parsePaymobRedirectQuery = (query) => {
  const obj = {
    id: query.id,
    amount_cents: query.amount_cents,
    integration_id: query.integration_id,
    created_at: query.created_at,
    currency: query.currency,
    owner: query.owner,
    order: query.order != null ? { id: query.order, merchant_order_id: query.merchant_order_id } : undefined,
    source_data: {
      type: query['source_data.type'],
      pan: query['source_data.pan'],
      sub_type: query['source_data.sub_type'],
    },
  };

  for (const key of PAYMOB_REDIRECT_BOOL_KEYS) obj[key] = parseBool(query[key]);
  return { hmac: query.hmac, obj };
};

/** Front-end return URL after Paymob redirect (success/fail). */
const buildPaymobReturnUrl = ({ success, merchantOrderId }) => {
  const base =
    process.env.PAYMOB_RETURN_URL ||
    process.env.STRIPE_SUCCESS_URL?.replace(/\?.*$/, '') ||
    'http://localhost:3000/checkout-test.html';

  const url = new URL(base);
  url.searchParams.set('payment', success ? 'completed' : 'failed');
  if (merchantOrderId) url.searchParams.set('paymentSessionId', merchantOrderId);
  return url.toString();
};

/** Verify Paymob HMAC signature over the canonical field concatenation. */
const verifyPaymobHmac = (obj, hmac) => {
  const secret = process.env.PAYMOB_HMAC_SECRET;
  if (!secret) throw new ApiError('Paymob HMAC secret is not configured', 503);
  if (!hmac) return false;

  const parts = [
    obj.amount_cents,
    obj.created_at,
    obj.currency,
    obj.error_occured,
    obj.has_parent_transaction,
    obj.id,
    obj.integration_id,
    obj.is_3d_secure,
    obj.is_auth,
    obj.is_capture,
    obj.is_refunded,
    obj.is_standalone_payment,
    obj.is_voided,
    obj.order?.id,
    obj.owner,
    obj.pending,
    obj.source_data?.pan,
    obj.source_data?.sub_type,
    obj.source_data?.type,
    obj.success,
  ].map((v) => (v == null ? '' : String(v)));

  const digest = crypto.createHmac('sha512', secret).update(parts.join('')).digest('hex');
  return digest === hmac;
};

/** Verify HMAC then fulfill (or mark failed) the linked PaymentSession. */
const processPaymobTransaction = async (obj, hmac) => {
  if (!verifyPaymobHmac(obj, hmac)) throw new ApiError('Invalid Paymob signature', 400);

  const paymentSessionId = obj.order?.merchant_order_id;
  if (!obj.success) {
    if (paymentSessionId) {
      await PaymentSession.updateOne(
        { _id: paymentSessionId, status: { $in: ACTIVE_STATUSES } },
        { status: 'failed' }
      );
    }
    return;
  }

  if (!paymentSessionId) throw new ApiError('Paymob callback missing merchant_order_id', 400);

  await assertPaymentSessionForFulfillment(paymentSessionId, {
    provider: 'paymob',
    amountCents: Number(obj.amount_cents),
  });
  await fulfillPaymentSession(paymentSessionId, String(obj.id));
};

/** Refund a Paymob transaction by id (amount in cents). */
export const createPaymobRefund = async ({ transactionId, amountCents }) => {
  const data = await paymobFetch('/acceptance/void_refund/refund', {
    auth_token: await getAuthToken(),
    transaction_id: Number(transactionId),
    amount_cents: amountCents,
  });

  if (!data?.id && !data?.success) {
    throw new ApiError(data?.detail || data?.message || 'Paymob refund failed', 502);
  }
  return data;
};

// ── Providers ──

/** Persist providerSessionId on the PaymentSession and return launch payload. */
const persistProviderLaunch = async (paymentSession, { providerSessionId, ...payload }) => {
  paymentSession.providerSessionId = providerSessionId;
  await paymentSession.save();
  return payload;
};

/** Provider launch strategies keyed by PaymentSession.provider. */
const paymentProviders = {
  stripe: async ({ paymentSession, totalPrice, user }) =>
    persistProviderLaunch(
      paymentSession,
      await createStripeCheckoutSession({
        paymentSessionId: paymentSession._id.toString(),
        totalPrice,
        userEmail: user.email,
      })
    ),

  paymob: async ({ paymentSession, totalPrice, user }) =>
    persistProviderLaunch(
      paymentSession,
      await createPaymobCheckout({
        paymentSessionId: paymentSession._id.toString(),
        totalPrice,
        user: { name: user.name, email: user.email, phone: user.phone },
      })
    ),
};

// ── Route handlers ──

/**
 * @desc    Start card checkout — order is created on provider webhook success
 * @route   POST /api/v1/orders/payment-session
 * @access  Private
 */
export const createPaymentSession = asyncHandler(async (req, res, next) => {
  const { addressId, governorateId, districtId, addressLine, provider, saveAddress, label, setAsDefault } =
    req.body;
  const userId = req.user._id;

  const addressInput = { addressId, governorateId, districtId, addressLine };
  const resolved = await resolveCheckoutAddressInput(userId, addressInput);
  const checkout = await prepareCheckoutFromCart(userId, resolved);

  if (saveAddress) {
    await appendUserAddress(userId, resolved, { label, isDefault: setAsDefault ?? false });
  }

  const startProvider = paymentProviders[provider];
  if (!startProvider) return next(new ApiError('Invalid payment provider', 400));

  const paymentSession = await PaymentSession.create(buildPaymentSessionDoc(userId, provider, checkout));

  let providerPayload;
  try {
    providerPayload = await startProvider({ paymentSession, totalPrice: checkout.totalPrice, user: req.user });
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
 * @access  Public
 */
export const stripeWebhook = asyncHandler(async (req, res) => {
  await handleStripeWebhookEvent(constructStripeEvent(req.body, req.headers['stripe-signature']));
  res.status(200).json({ received: true });
});

/**
 * @desc    Paymob processed callback (POST)
 * @route   POST /api/v1/webhooks/paymob
 * @access  Public
 */
export const paymobWebhook = asyncHandler(async (req, res) => {
  const { type, obj, hmac } = req.body;
  if (type === 'TRANSACTION' && obj) await processPaymobTransaction(obj, hmac);
  res.status(200).json({ received: true });
});

/**
 * @desc    Paymob response callback (GET redirect)
 * @route   GET /api/v1/webhooks/paymob
 * @access  Public
 */
export const paymobRedirect = asyncHandler(async (req, res, next) => {
  const { obj, hmac } = parsePaymobRedirectQuery(req.query);
  if (!obj?.id) return next(new ApiError('Invalid Paymob callback', 400));

  await processPaymobTransaction(obj, hmac);
  res.redirect(
    302,
    buildPaymobReturnUrl({ success: obj.success, merchantOrderId: obj.order?.merchant_order_id })
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

  if (!paymentSession) return next(sessionNotFound(req.params.id));

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

/** Validate Bosta webhook auth header against BOSTA_WEBHOOK_SECRET when set. */
const verifyBostaWebhook = (req) => {
  const secret = process.env.BOSTA_WEBHOOK_SECRET?.trim();
  if (!secret) return;

  const customHeader = process.env.BOSTA_WEBHOOK_AUTH_HEADER?.trim()?.toLowerCase();
  const header =
    (customHeader && req.headers[customHeader]) ||
    req.headers['x-bosta-signature'] ||
    req.headers['x-webhook-secret'] ||
    req.headers.authorization;

  const valid =
    header === secret ||
    header === `Bearer ${secret}` ||
    header === `Basic ${secret}` ||
    header === `Basic ${Buffer.from(secret).toString('base64')}`;

  if (!valid) throw new ApiError('Invalid Bosta webhook signature', 401);
};

/**
 * @desc    Bosta delivery state webhook
 * @route   POST /api/v1/webhooks/bosta
 * @access  Public
 */
export const bostaWebhook = asyncHandler(async (req, res) => {
  verifyBostaWebhook(req);

  const result = await handleBostaWebhookPayload(req.body);
  sendResponse(res, {
    message: result.handled
      ? 'Bosta webhook processed successfully'
      : 'Bosta webhook received (no matching record)',
    data: result,
  });
});
