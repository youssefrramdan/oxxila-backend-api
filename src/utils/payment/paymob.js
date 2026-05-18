// src/utils/payment/paymob.js
import crypto from 'crypto';
import ApiError from '../apiError.js';
import { toMinorUnits } from '../checkoutHelpers.js';
import {
  assertPaymentSessionForFulfillment,
  fulfillPaymentSession,
  markPaymentSessionFailed,
} from './session.js';

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

const getAuthToken = async () => {
  const apiKey = process.env.PAYMOB_API_KEY;
  if (!apiKey) throw new ApiError('Paymob is not configured', 503);

  const { token } = await paymobFetch('/auth/tokens', { api_key: apiKey });
  if (!token) throw new ApiError('Paymob authentication failed', 502);
  return token;
};

export const createPaymobCheckout = async ({ paymentSessionId, totalPrice, user }) => {
  const integrationId = Number(process.env.PAYMOB_INTEGRATION_ID);
  const iframeId = process.env.PAYMOB_IFRAME_ID;
  if (!integrationId || !iframeId) {
    throw new ApiError('Paymob integration settings are not configured', 503);
  }

  const authToken = await getAuthToken();
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

  if (!paymentToken) throw new ApiError('Paymob payment key creation failed', 502);

  return {
    providerSessionId: String(paymobOrderId),
    iframeUrl: `https://accept.paymob.com/api/acceptance/iframes/${iframeId}?payment_token=${paymentToken}`,
  };
};

const parseBool = (value) => {
  if (value === true || value === false) return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return Boolean(value);
};

export const parsePaymobRedirectQuery = (query) => ({
  hmac: query.hmac,
  obj: {
    id: query.id,
    pending: parseBool(query.pending),
    amount_cents: query.amount_cents,
    success: parseBool(query.success),
    is_auth: parseBool(query.is_auth),
    is_capture: parseBool(query.is_capture),
    is_standalone_payment: parseBool(query.is_standalone_payment),
    is_voided: parseBool(query.is_voided),
    is_refunded: parseBool(query.is_refunded),
    is_3d_secure: parseBool(query.is_3d_secure),
    integration_id: query.integration_id,
    has_parent_transaction: parseBool(query.has_parent_transaction),
    order:
      query.order != null
        ? { id: query.order, merchant_order_id: query.merchant_order_id }
        : undefined,
    created_at: query.created_at,
    currency: query.currency,
    error_occured: parseBool(query.error_occured),
    owner: query.owner,
    source_data: {
      type: query['source_data.type'],
      pan: query['source_data.pan'],
      sub_type: query['source_data.sub_type'],
    },
  },
});

export const buildPaymobReturnUrl = ({ success, merchantOrderId }) => {
  const base =
    process.env.PAYMOB_RETURN_URL ||
    process.env.STRIPE_SUCCESS_URL?.replace(/\?.*$/, '') ||
    'http://localhost:3000/checkout-test.html';

  const url = new URL(base);
  url.searchParams.set('payment', success ? 'completed' : 'failed');
  if (merchantOrderId) url.searchParams.set('paymentSessionId', merchantOrderId);
  return url.toString();
};

const verifyHmac = (obj, hmac) => {
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

export const processPaymobTransaction = async (obj, hmac) => {
  if (!verifyHmac(obj, hmac)) {
    throw new ApiError('Invalid Paymob signature', 400);
  }

  const paymentSessionId = obj.order?.merchant_order_id;

  if (!obj.success) {
    await markPaymentSessionFailed(paymentSessionId);
    return;
  }

  if (!paymentSessionId) {
    throw new ApiError('Paymob callback missing merchant_order_id', 400);
  }

  await assertPaymentSessionForFulfillment(paymentSessionId, {
    provider: 'paymob',
    amountCents: Number(obj.amount_cents),
  });
  await fulfillPaymentSession(paymentSessionId, String(obj.id));
};

export const createPaymobRefund = async ({ transactionId, amountCents }) => {
  const authToken = await getAuthToken();
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
