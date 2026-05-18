// src/utils/carriers/bosta.js

const splitReceiverName = (receiverName) => {
  const parts = (receiverName || '').trim().split(/\s+/).filter(Boolean);
  const firstName = parts[0] || 'Customer';
  const lastName = parts.slice(1).join(' ') || firstName;
  return { firstName, lastName };
};

export const bostaRequest = async (method, path, body, { apiKey, apiBaseUrl }) => {
  const base = apiBaseUrl.replace(/\/$/, '');
  const options = {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
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

export const createBostaDelivery = async (params, credentials) => {
  const { firstName, lastName } = splitReceiverName(params.receiverName);

  return bostaRequest(
    'POST',
    '/api/v2/deliveries',
    {
      type: 10,
      specs: { packageDetails: [{ size: 'MEDIUM' }] },
      receiver: {
        firstName,
        lastName,
        phone: params.receiverPhone,
        address: params.receiverAddress,
      },
      cod: params.cod,
      businessReference: params.businessReference,
      notes: params.notes ?? '',
    },
    credentials
  );
};

export const trackBostaDelivery = async (trackingNumber, credentials) =>
  bostaRequest('GET', `/api/v2/deliveries/tracking/${trackingNumber}`, null, credentials);

export const cancelBostaDelivery = async (deliveryId, credentials) =>
  bostaRequest('DELETE', `/api/v2/deliveries/${deliveryId}`, null, credentials);
