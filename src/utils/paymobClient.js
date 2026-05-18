// src/utils/paymobClient.js
import crypto from 'crypto';
import ApiError from './apiError.js';
import { toMinorUnits } from './checkoutHelpers.js';

const PAYMOB_BASE = 'https://accept.paymob.com/api';

const paymobFetch = async (path, body) => {
  const res = await fetch(`${PAYMOB_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(data?.detail || data?.message || 'Paymob request failed', 502);
  }
  return data;
};

const getPaymobAuthToken = async () => {
  const apiKey = process.env.PAYMOB_API_KEY;
  if (!apiKey) throw new ApiError('Paymob is not configured', 503);

  const { token } = await paymobFetch('/auth/tokens', { api_key: apiKey });
  if (!token) throw new ApiError('Paymob authentication failed', 502);
  return token;
};

/**
 * @param {{ paymentSessionId: string, totalPrice: number, user: { name?: string, email: string, phone?: string } }} params
 */
export const createPaymobPaymentSession = async ({ paymentSessionId, totalPrice, user }) => {
  const integrationId = Number(process.env.PAYMOB_INTEGRATION_ID);
  const iframeId = process.env.PAYMOB_IFRAME_ID;
  if (!integrationId || !iframeId) {
    throw new ApiError('Paymob integration settings are not configured', 503);
  }

  const authToken = await getPaymobAuthToken();
  const amountCents = toMinorUnits(totalPrice);
  const currency = process.env.PAYMOB_CURRENCY || 'EGP';

  const [firstName, ...rest] = (user.name || 'Customer').trim().split(/\s+/);
  const lastName = rest.join(' ') || '-';

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
    billing_data: {
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
      last_name: lastName,
      state: 'NA',
    },
    currency,
    integration_id: integrationId,
  });

  if (!paymentToken) {
    throw new ApiError('Paymob payment key creation failed', 502);
  }

  return {
    sessionId: String(paymobOrderId),
    paymentToken,
    iframeUrl: `https://accept.paymob.com/api/acceptance/iframes/${iframeId}?payment_token=${paymentToken}`,
  };
};

/**
 * Paymob processed-callback HMAC (Accept API).
 * @see https://developers.paymob.com/egypt/api-reference-guide/basics-of-api#hmac-calculation
 */
const parsePaymobBool = (value) => {
  if (value === true || value === false) return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return Boolean(value);
};

/**
 * Maps Transaction Response Callback query params to the same shape as the processed POST body.
 */
export const parsePaymobResponseQuery = (query) => {
  const hmac = query.hmac;
  const paymobOrderId = query.order;

  const obj = {
    id: query.id,
    pending: parsePaymobBool(query.pending),
    amount_cents: query.amount_cents,
    success: parsePaymobBool(query.success),
    is_auth: parsePaymobBool(query.is_auth),
    is_capture: parsePaymobBool(query.is_capture),
    is_standalone_payment: parsePaymobBool(query.is_standalone_payment),
    is_voided: parsePaymobBool(query.is_voided),
    is_refunded: parsePaymobBool(query.is_refunded),
    is_3d_secure: parsePaymobBool(query.is_3d_secure),
    integration_id: query.integration_id,
    has_parent_transaction: parsePaymobBool(query.has_parent_transaction),
    order:
      paymobOrderId != null
        ? { id: paymobOrderId, merchant_order_id: query.merchant_order_id }
        : undefined,
    created_at: query.created_at,
    currency: query.currency,
    error_occured: parsePaymobBool(query.error_occured),
    owner: query.owner,
    source_data: {
      type: query['source_data.type'],
      pan: query['source_data.pan'],
      sub_type: query['source_data.sub_type'],
    },
  };

  return { type: 'TRANSACTION', obj, hmac };
};

/** Where Paymob redirects the customer after card payment (response callback). */
export const buildPaymobReturnUrl = ({ success, merchantOrderId }) => {
  const configured =
    process.env.PAYMOB_RETURN_URL ||
    process.env.STRIPE_SUCCESS_URL?.replace(/\?.*$/, '') ||
    'http://localhost:3000/checkout-test.html';

  const url = new URL(configured);
  url.searchParams.set('payment', success ? 'completed' : 'failed');
  if (merchantOrderId) url.searchParams.set('paymentSessionId', merchantOrderId);
  return url.toString();
};

export const verifyPaymobProcessedHmac = (obj, hmac) => {
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
  ].map((v) => (v === undefined || v === null ? '' : String(v)));

  const digest = crypto.createHmac('sha512', secret).update(parts.join('')).digest('hex');
  return digest === hmac;
};

/**
 * Partial or full refund for a captured Paymob transaction.
 * @param {{ transactionId: string, amountCents: number }} params
 */
export const createPaymobRefund = async ({ transactionId, amountCents }) => {
  const authToken = await getPaymobAuthToken();

  const data = await paymobFetch('/acceptance/void_refund/refund', {
    auth_token: authToken,
    transaction_id: Number(transactionId),
    amount_cents: amountCents,
  });

  if (!data?.id && !data?.success) {
    throw new ApiError(data?.detail || data?.message || 'Paymob refund failed', 502);
  }

  return data;
};
