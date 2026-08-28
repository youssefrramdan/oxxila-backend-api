// src/utils/orderDeliveryEstimate.js
import { parseDeliveryDays } from './carrierDeliveryDays.js';

export { parseDeliveryDays } from './carrierDeliveryDays.js';

/** True when a shipment already has a committed carrier assignment. */
export const isCommittedCarrierAssignment = (shipment) => {
  if (!shipment?.carrier) return false;
  if (shipment.carrierType === 'api') {
    return Boolean(shipment.externalDeliveryId);
  }
  if (shipment.carrierType === 'known' || shipment.carrierType === 'internal') {
    return Boolean(shipment.trackingNumber);
  }
  return Boolean(shipment.externalDeliveryId || shipment.trackingNumber);
};

export const addBusinessDays = (from, businessDays) => {
  const date = new Date(from);
  let added = 0;

  while (added < businessDays) {
    date.setDate(date.getDate() + 1);
    const weekday = date.getDay();
    if (weekday !== 0 && weekday !== 6) added += 1;
  }

  return date;
};

/** Build customer-facing delivery estimate from shipment + carrier deliveryDays. */
export const buildOrderDeliveryEstimate = (shipment, carrierDeliveryDays) => {
  if (!isCommittedCarrierAssignment(shipment)) return null;

  const parsed = parseDeliveryDays(carrierDeliveryDays);
  if (!parsed) return null;

  const baseDate = shipment.assignedAt ? new Date(shipment.assignedAt) : new Date();
  const minDate = addBusinessDays(baseDate, parsed.min);
  const maxDate = addBusinessDays(baseDate, parsed.max);

  return {
    carrierName: shipment.carrierName?.trim() || null,
    deliveryDaysLabel: parsed.label,
    minBusinessDays: parsed.min,
    maxBusinessDays: parsed.max,
    estimatedFrom: minDate.toISOString(),
    estimatedTo: maxDate.toISOString(),
    assignedAt: shipment.assignedAt ? new Date(shipment.assignedAt).toISOString() : null,
  };
};
