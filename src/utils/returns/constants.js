// src/utils/returns/constants.js

export const RETURN_WINDOW_DAYS = Number(process.env.RETURN_WINDOW_DAYS) || 14;

export const PROOF_REQUIRED_REASONS = new Set([
  'damaged_item',
  'wrong_product',
  'allergic_reaction',
]);

export const QUANTITY_RESERVED_STATUSES = [
  'pending',
  'approved',
  'picked_up',
  'received',
];

export const REFUND_STATUS_TRANSITIONS = {
  pending: ['approved', 'rejected'],
  approved: ['picked_up', 'rejected'],
  picked_up: ['received'],
  received: ['refunded'],
  rejected: [],
  refunded: [],
};
