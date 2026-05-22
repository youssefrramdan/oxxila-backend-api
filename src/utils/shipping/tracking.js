// src/utils/shipping/tracking.js
import { mapBostaStateToPhase, normalizeBostaState } from '../carriers/bostaStates.js';

export const ORDER_TRACKING_STEPS = [
  { key: 'placed', label: 'Order placed', order: 1 },
  { key: 'handed_over', label: 'Picked up', order: 2 },
  { key: 'in_transit', label: 'On the way', order: 3 },
  { key: 'delivered', label: 'Delivered', order: 4 },
];

/** Fixed customer-facing labels — same on my-orders, admin, and track. */
export const ORDER_STATUS_LABELS = {
  pending: 'Order placed',
  confirmed: 'Order placed',
  processing: 'Preparing shipment',
  shipped: 'On the way',
  out_for_delivery: 'Out for delivery',
  failed_attempt: 'Delivery attempt failed',
  returned: 'Returned',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

export const PAYMENT_STATUS_LABELS = {
  pending: 'Payment pending',
  paid: 'Paid',
  refunded: 'Refunded',
};

export const getOrderStatusLabel = (orderStatus) =>
  ORDER_STATUS_LABELS[orderStatus] ?? ORDER_STATUS_LABELS.pending;

export const getPaymentStatusLabel = (paymentStatus, paymentMethod) => {
  if (paymentStatus === 'pending' && paymentMethod === 'cod') {
    return 'Pay on delivery';
  }
  return PAYMENT_STATUS_LABELS[paymentStatus] ?? PAYMENT_STATUS_LABELS.pending;
};

const buildStepper = (steps, activeKey) => {
  const activeOrder =
    steps.find((s) => s.key === activeKey)?.order ?? steps[steps.length - 1].order + 1;
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

export const mapOrderStatusToPhase = (orderStatus) => {
  switch (orderStatus) {
    case 'pending':
    case 'confirmed':
      return 'placed';
    case 'processing':
      return 'handed_over';
    case 'shipped':
    case 'out_for_delivery':
    case 'failed_attempt':
      return 'in_transit';
    case 'returned':
      return 'cancelled';
    case 'delivered':
      return 'delivered';
    case 'cancelled':
      return 'cancelled';
    default:
      return 'placed';
  }
};

export const resolveOrderTrackingPhase = (order, shipment) => {
  const fromBosta = shipment?.providerState
    ? mapBostaStateToPhase(shipment.providerState)
    : null;
  if (fromBosta && fromBosta !== 'cancelled') return fromBosta;
  if (shipment?.status === 'delivered') return 'delivered';
  if (['in_transit', 'out_for_delivery'].includes(shipment?.status)) return 'in_transit';
  if (shipment?.status === 'picked_up' || shipment?.status === 'submitted') return 'handed_over';
  return mapOrderStatusToPhase(order?.orderStatus);
};

export const buildOrderTrackingPayload = (order, shipment = null) => {
  const phase = resolveOrderTrackingPhase(order, shipment);
  const steps =
    phase === 'cancelled'
      ? buildStepper(ORDER_TRACKING_STEPS, 'placed').map((s) => ({
          ...s,
          status: 'upcoming',
        }))
      : buildStepper(ORDER_TRACKING_STEPS, phase === 'out_for_delivery' ? 'in_transit' : phase);

  return {
    phase,
    currentStep: phase === 'out_for_delivery' ? 'in_transit' : phase,
    steps,
    trackingNumber: shipment?.trackingNumber ?? null,
    carrierName: shipment?.carrierName ?? null,
    carrierStatusLabel: shipment?.providerStateLabel ?? null,
    carrierStatusCode: normalizeBostaState(shipment?.providerState),
  };
};
