// src/utils/carriers/bosta/client.js
import Carrier from '../../../models/Carrier.js';

export const normalizeBostaBaseUrl = (apiBaseUrl) => {
  let base = String(apiBaseUrl || 'https://app.bosta.co').trim();
  if (!base) base = 'https://app.bosta.co';
  return base.replace(/\/+$/, '').replace(/\/api\/v2$/i, '');
};

export const getBostaCredentials = async (carrierOrId) => {
  const id = carrierOrId?._id ?? carrierOrId;
  const carrier = await Carrier.findById(id).select('+apiKey +apiBaseUrl');
  if (!carrier?.apiKey?.trim()) return null;
  if (carrier.apiProvider !== 'bosta' || carrier.type !== 'api') return null;

  return {
    apiKey: carrier.apiKey.trim(),
    apiBaseUrl: normalizeBostaBaseUrl(carrier.apiBaseUrl),
  };
};

export const splitBostaContactName = (fullName) => {
  const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
  const firstName = parts[0] || 'Contact';
  const lastName = parts.slice(1).join(' ') || firstName;
  return { firstName, lastName };
};

export const normalizeEgyptPhone = (phone) => {
  const raw = String(phone || '').trim();
  if (!raw) return '';
  if (raw.startsWith('+20')) return raw;
  if (raw.startsWith('20') && raw.length >= 12) return `+${raw}`;
  if (raw.startsWith('0')) return `+20${raw.slice(1)}`;
  return raw;
};

export const formatBostaError = (err) => {
  const msg =
    err?.bostaError?.message ??
    err?.bostaError?.errorMessage ??
    err?.message ??
    'Bosta request failed';
  return String(msg);
};

export const isUncoveredAddressError = (err) =>
  /uncovered drop-off or pickup/i.test(formatBostaError(err));

export const bostaRequest = async (method, path, body, { apiKey, apiBaseUrl }) => {
  const base = apiBaseUrl.replace(/\/$/, '');
  const options = {
    method,
    headers: {
      Authorization: apiKey?.trim(),
      'Content-Type': 'application/json',
    },
  };
  if (body !== undefined && body !== null) {
    options.body = JSON.stringify(body);
  }

  const res = await fetch(`${base}${path}`, options);
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const err = new Error(
      data?.message || data?.error || data?.errorMessage || 'Bosta request failed'
    );
    err.statusCode = res.status;
    err.bostaError = data;
    throw err;
  }

  return data;
};
