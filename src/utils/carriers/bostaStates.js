// src/utils/carriers/bostaStates.js
import logger from '../../config/logger.js';

export const ORDER_STATUS_RANK = {
  pending: 1,
  confirmed: 2,
  processing: 3,
  shipped: 4,
  failed_attempt: 5,
  out_for_delivery: 6,
  returned: 7,
  delivered: 8,
  cancelled: 0,
};

/** Webhook-only mapping: Bosta state code → orderStatus. */
const BOSTA_WEBHOOK_ORDER_STATUS = {
  10: 'processing',
  20: 'processing',
  21: 'processing',
  24: 'shipped',
  30: 'shipped',
  41: 'out_for_delivery',
  45: 'delivered',
  46: 'returned',
  47: 'failed_attempt',
  48: 'cancelled',
  49: 'cancelled',
  100: 'cancelled',
  101: 'cancelled',
};

const FORCE_ORDER_STATUS = new Set(['delivered', 'cancelled', 'returned', 'failed_attempt']);

/** Official Bosta webhook state codes (dashboard shipment status). */
export const BOSTA_STATE_LABELS = {
  10: 'Pickup requested',
  11: 'Waiting for route',
  20: 'Route assigned',
  21: 'Picked up from business',
  22: 'Picking up from consignee',
  23: 'Picked up from consignee',
  24: 'Received at warehouse',
  25: 'Fulfilled',
  30: 'In transit between hubs',
  40: 'Picking up',
  41: 'Out for delivery',
  45: 'Delivered',
  46: 'Returned to business',
  47: 'Exception',
  48: 'Terminated',
  49: 'Canceled',
  60: 'Returned to stock',
  100: 'Lost',
  101: 'Damaged',
  102: 'Investigation',
  103: 'Awaiting your action',
  104: 'Archived',
  105: 'On hold',
};

const BOSTA_SUBMITTED_STATES = new Set(['10', '11', '20']);
const BOSTA_PICKUP_STATES = new Set(['21', '22', '23', '40']);
const BOSTA_OUT_FOR_DELIVERY_STATES = new Set(['41']);
const BOSTA_IN_TRANSIT_STATES = new Set(['24', '25', '30', '102', '105']);
const BOSTA_DELIVERED_STATES = new Set(['45']);
const BOSTA_RETURNED_STATES = new Set(['46', '60']);
const BOSTA_EXCEPTION_STATES = new Set(['47']);
const BOSTA_CANCELLED_STATES = new Set([
  '48',
  '49',
  '100',
  '101',
  '104',
  'CANCELLED',
  'CANCELED',
  'TERMINATED',
  'LOST',
  'DAMAGED',
  'ARCHIVED',
]);

export { BOSTA_CANCELLED_STATES };

export const normalizeBostaState = (state) => {
  if (state == null) return null;
  if (typeof state === 'object') {
    const v = state.value ?? state.name ?? state.code;
    if (v != null) return normalizeBostaState(v);
    return null;
  }
  const s = String(state).trim();
  if (!s) return null;
  if (/^\d+$/.test(s)) return s;
  return s.replace(/\s+/g, '_').toUpperCase();
};

export const getBostaStateLabel = (state) => {
  const code = normalizeBostaState(state);
  if (!code) return null;
  return BOSTA_STATE_LABELS[code] ?? null;
};

export const parseBostaStateParts = (state) => {
  if (state == null) return { code: null, label: null };
  if (typeof state === 'object') {
    const code = state.code != null ? String(state.code) : normalizeBostaState(state);
    return {
      code,
      label: state.value ?? state.name ?? getBostaStateLabel(code),
    };
  }
  const code = normalizeBostaState(state);
  return { code, label: getBostaStateLabel(code) ?? String(state) };
};

export const mapBostaWebhookToOrderStatus = (bostaState) => {
  const code = normalizeBostaState(bostaState);
  if (!code) return null;

  const status = BOSTA_WEBHOOK_ORDER_STATUS[code];
  if (status) return status;

  if (/^\d+$/.test(code)) {
    logger.warn(`Unknown Bosta webhook state code: ${code}`);
  }
  return null;
};

export const mapBostaStateToOrderStatus = (bostaState, currentStatus = 'pending') => {
  const next = mapBostaWebhookToOrderStatus(bostaState);
  if (!next) return null;
  if (FORCE_ORDER_STATUS.has(next)) return next;
  return pickHigherOrderStatus(currentStatus, next);
};

export const mapBostaStateToPhase = (bostaState) => {
  const s = normalizeBostaState(bostaState);
  if (!s) return null;
  if (BOSTA_CANCELLED_STATES.has(s)) return 'cancelled';
  if (BOSTA_RETURNED_STATES.has(s)) return 'returned';
  if (BOSTA_DELIVERED_STATES.has(s)) return 'delivered';
  if (BOSTA_EXCEPTION_STATES.has(s)) return 'exception';
  if (BOSTA_OUT_FOR_DELIVERY_STATES.has(s)) return 'out_for_delivery';
  if (BOSTA_IN_TRANSIT_STATES.has(s)) return 'in_transit';
  if (BOSTA_PICKUP_STATES.has(s)) return 'handed_over';
  if (BOSTA_SUBMITTED_STATES.has(s)) return 'placed';
  return null;
};

export const mapBostaStateToShipmentStatus = (bostaState, current = 'pending_assignment') => {
  const phase = mapBostaStateToPhase(bostaState);
  if (!phase) return null;
  const map = {
    placed: 'submitted',
    handed_over: 'picked_up',
    in_transit: 'in_transit',
    out_for_delivery: 'out_for_delivery',
    delivered: 'delivered',
    returned: 'cancelled',
    cancelled: 'cancelled',
    exception: 'failed',
  };
  return map[phase] ?? current;
};

export const pickHigherOrderStatus = (current, next) => {
  if (!next) return current;
  const a = ORDER_STATUS_RANK[current] ?? 0;
  const b = ORDER_STATUS_RANK[next] ?? 0;
  return b >= a ? next : current;
};
