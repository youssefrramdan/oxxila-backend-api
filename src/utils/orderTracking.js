// src/utils/orderTracking.js
import { mapBostaStateToTrackingStep } from './carriers/bostaFulfillment.js';

export const ORDER_TRACKING_STEPS = [
  { key: 'pending', label: 'Pending', order: 1 },
  { key: 'confirmed', label: 'Confirmed', order: 2 },
  { key: 'processing', label: 'Processing', order: 3 },
  { key: 'shipping', label: 'Shipping', order: 4 },
  { key: 'delivery', label: 'Delivery', order: 5 },
];

export const RETURN_TRACKING_STEPS = [
  { key: 'request_sent', label: 'Request Sent', order: 1 },
  { key: 'approval', label: 'Approval', order: 2 },
  { key: 'pickup', label: 'Pickup', order: 3 },
  { key: 'refund', label: 'Refund', order: 4 },
];

const buildStepper = (steps, activeKey) => {
  const activeOrder =
    steps.find((s) => s.key === activeKey)?.order ??
    steps[steps.length - 1].order + 1;
  return steps.map((step) => ({
    ...step,
    status:
      step.order < activeOrder
        ? 'completed'
        : step.order === activeOrder
          ? 'active'
          : 'upcoming',
  }));
};

export const resolveOrderTrackingStep = (order) => {
  const fromBosta = mapBostaStateToTrackingStep(order?.fulfillment?.bostaState);
  if (fromBosta) return fromBosta;

  switch (order?.orderStatus) {
    case 'pending':
      return 'pending';
    case 'confirmed':
      return 'confirmed';
    case 'processing':
      return 'processing';
    case 'shipped':
      return 'shipping';
    case 'delivered':
    case 'partially_returned':
    case 'returned':
      return 'delivery';
    default:
      return null;
  }
};

export const resolveReturnTrackingStep = (returnRequest) => {
  const fromBosta = mapBostaStateToTrackingStep(returnRequest?.bostaReturnState);
  if (fromBosta) {
    if (fromBosta === 'delivery') return 'pickup';
    if (fromBosta === 'shipping' || fromBosta === 'processing') return 'pickup';
    if (fromBosta === 'confirmed') return 'approval';
  }

  switch (returnRequest?.refundStatus) {
    case 'pending':
      return 'request_sent';
    case 'approved':
      return 'approval';
    case 'picked_up':
    case 'received':
      return 'pickup';
    case 'refunded':
      return 'refund';
    default:
      return null;
  }
};

export const buildOrderTrackingPayload = (order) => {
  const currentStep = resolveOrderTrackingStep(order);
  return {
    currentStep,
    steps: buildStepper(ORDER_TRACKING_STEPS, currentStep),
    bostaState: order?.fulfillment?.bostaState ?? null,
    trackingNumber: order?.fulfillment?.trackingNumber ?? null,
  };
};

export const buildReturnTrackingPayload = (returnRequest) => {
  const currentStep = resolveReturnTrackingStep(returnRequest);
  return {
    currentStep,
    steps: buildStepper(RETURN_TRACKING_STEPS, currentStep),
    bostaState: returnRequest?.bostaReturnState ?? null,
    trackingNumber: returnRequest?.bostaReturnTrackingNumber ?? null,
  };
};

export const enrichOrderDocument = (order) => {
  const doc = order?.toObject ? order.toObject() : { ...order };
  return { ...doc, tracking: buildOrderTrackingPayload(doc) };
};

export const enrichReturnDocument = (returnRequest) => {
  const doc = returnRequest?.toObject ? returnRequest.toObject() : { ...returnRequest };
  return { ...doc, tracking: buildReturnTrackingPayload(doc) };
};
