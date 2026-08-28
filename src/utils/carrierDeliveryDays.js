// src/utils/carrierDeliveryDays.js

/** Parse deliveryDays strings such as "2-4 business days" or "1-2". */
export const parseDeliveryDays = (value) => {
  if (!value || typeof value !== 'string') return null;

  const label = value.trim();
  const normalized = label.toLowerCase();

  if (normalized.includes('same day')) {
    return { min: 0, max: 0, label };
  }

  const rangeMatch = normalized.match(/(\d+)\s*[-–]\s*(\d+)/);
  if (rangeMatch) {
    return {
      min: Number.parseInt(rangeMatch[1], 10),
      max: Number.parseInt(rangeMatch[2], 10),
      label,
    };
  }

  const singleMatch = normalized.match(/(\d+)/);
  if (singleMatch) {
    const days = Number.parseInt(singleMatch[1], 10);
    return { min: days, max: days, label };
  }

  return null;
};

/** Canonical stored value: "min-max" or a single day count. */
export const formatDeliveryDaysRange = (min, max) => {
  const minNum = Number(min);
  const maxNum = Number(max);

  if (!Number.isInteger(minNum) || !Number.isInteger(maxNum) || minNum < 0 || maxNum < 0) {
    return null;
  }
  if (minNum > maxNum) return null;

  return minNum === maxNum ? String(minNum) : `${minNum}-${maxNum}`;
};

const hasDeliveryDayNumber = (value) =>
  value !== undefined && value !== null && String(value).trim() !== '';

/** Resolve create/update body into a normalized deliveryDays string. */
export const resolveCarrierDeliveryDays = (input, { required = false } = {}) => {
  const { deliveryDays, deliveryDaysMin, deliveryDaysMax } = input ?? {};
  const hasMin = hasDeliveryDayNumber(deliveryDaysMin);
  const hasMax = hasDeliveryDayNumber(deliveryDaysMax);

  if (hasMin || hasMax) {
    if (!hasMin || !hasMax) {
      throw new Error('deliveryDaysMin and deliveryDaysMax must both be provided');
    }

    const formatted = formatDeliveryDaysRange(deliveryDaysMin, deliveryDaysMax);
    if (!formatted) {
      throw new Error(
        'deliveryDaysMin and deliveryDaysMax must be non-negative integers and max must be greater than or equal to min'
      );
    }

    return formatted;
  }

  if (typeof deliveryDays === 'string' && deliveryDays.trim()) {
    const parsed = parseDeliveryDays(deliveryDays);
    if (!parsed) {
      throw new Error('deliveryDays must be a valid day range');
    }

    const formatted = formatDeliveryDaysRange(parsed.min, parsed.max);
    if (!formatted) {
      throw new Error('deliveryDays must be a valid day range');
    }

    return formatted;
  }

  if (required) {
    throw new Error('deliveryDaysMin and deliveryDaysMax are required for non-API carriers');
  }

  return undefined;
};
