// src/utils/shipping/generateTrackingNumber.js
import Shipment from '../../models/Shipment.js';

export const generateManualTrackingNumber = async (order, carrier) => {
  const code = String(carrier?.code || 'OX')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 6) || 'OX';
  const suffix = String(order._id).slice(-10).toUpperCase();
  let candidate = `OX-${code}-${suffix}`;
  let attempt = 0;

  while (attempt < 8) {
    const exists = await Shipment.exists({ trackingNumber: candidate });
    if (!exists) return candidate;
    attempt += 1;
    candidate = `OX-${code}-${suffix}-${attempt}`;
  }

  return `OX-${code}-${Date.now().toString(36).toUpperCase()}`;
};
