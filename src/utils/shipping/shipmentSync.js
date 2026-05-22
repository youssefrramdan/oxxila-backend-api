// src/utils/shipping/shipmentSync.js
import Order from '../../models/Order.js';
import Shipment from '../../models/Shipment.js';
import {
  mapBostaStateToOrderStatus,
  mapBostaStateToShipmentStatus,
  mapBostaWebhookToOrderStatus,
  normalizeBostaState,
  parseBostaStateParts,
} from '../carriers/bostaStates.js';
const SHIPMENT_STATUS_RANK = {
  pending_assignment: 0,
  submitted: 1,
  picked_up: 2,
  in_transit: 3,
  out_for_delivery: 4,
  delivered: 5,
  failed: 0,
  cancelled: 0,
};

const pickHigherShipmentStatus = (current, next) => {
  if (!next) return current;
  const a = SHIPMENT_STATUS_RANK[current] ?? 0;
  const b = SHIPMENT_STATUS_RANK[next] ?? 0;
  return b >= a ? next : current;
};

export const appendShipmentEvent = (shipment, { code, label, source = 'webhook' }) => {
  if (!code && !label) return;
  shipment.events.push({
    at: new Date(),
    code: code ?? null,
    label: label ?? null,
    source,
  });
  if (shipment.events.length > 50) {
    shipment.events = shipment.events.slice(-50);
  }
};

const buildWebhookNotes = (webhook) => {
  if (!webhook?.exceptionReason && webhook?.exceptionCode == null) return null;
  const parts = [];
  if (webhook.exceptionCode != null) parts.push(`NDR ${webhook.exceptionCode}`);
  if (webhook.exceptionReason) parts.push(webhook.exceptionReason);
  return parts.join(': ') || null;
};

export const applyProviderStateToShipment = async (
  shipment,
  rawState,
  { source = 'webhook', webhook = null } = {}
) => {
  const normalized = normalizeBostaState(rawState);
  if (!normalized) return shipment;

  const { code, label } = parseBostaStateParts(rawState);
  const nextShipmentStatus = mapBostaStateToShipmentStatus(normalized, shipment.status);
  const updates = {
    providerState: normalized,
    providerStateLabel: label ?? shipment.providerStateLabel,
  };

  if (webhook?.numberOfAttempts != null) {
    const attempts = Number(webhook.numberOfAttempts);
    if (!Number.isNaN(attempts)) updates.attemptCount = attempts;
  }

  const exceptionNote = buildWebhookNotes(webhook);
  if (exceptionNote) updates.lastError = exceptionNote;

  if (nextShipmentStatus) {
    updates.status = pickHigherShipmentStatus(shipment.status, nextShipmentStatus);
  }

  const updated = await Shipment.findByIdAndUpdate(
    shipment._id,
    { $set: updates },
    { new: true, runValidators: true }
  );

  appendShipmentEvent(updated, { code: code ?? normalized, label, source });
  await updated.save();

  await syncOrderFromShipment(updated, { webhook, source });
  return updated;
};

export const syncOrderFromShipment = async (shipment, { webhook = null, source = 'webhook' } = {}) => {
  const order = await Order.findById(shipment.order);
  if (!order) return null;

  const mapped =
    source === 'webhook'
      ? mapBostaWebhookToOrderStatus(shipment.providerState)
      : mapBostaStateToOrderStatus(shipment.providerState, order.orderStatus);

  if (!mapped) return order;

  const orderUpdates = {};
  const isFailedAttempt = mapped === 'failed_attempt';
  const statusChanged = mapped !== order.orderStatus;

  if (isFailedAttempt || statusChanged) {
    orderUpdates.orderStatus = mapped;
  }

  if (mapped === 'delivered') {
    orderUpdates.deliveredAt = order.deliveredAt ?? new Date();
    if (order.paymentMethod === 'cod' && order.paymentStatus === 'pending') {
      orderUpdates.paymentStatus = 'paid';
      orderUpdates.codCollectedAt = new Date();
    }
  }

  if (isFailedAttempt) {
    const reason = webhook?.exceptionReason?.trim() || null;
    if (reason) {
      orderUpdates['fulfillment.exceptionReason'] = reason;
    }
    const currentAttempts = order.fulfillment?.attempts ?? 0;
    orderUpdates['fulfillment.attempts'] = currentAttempts + 1;
  }

  if (Object.keys(orderUpdates).length === 0) return order;

  return Order.findByIdAndUpdate(order._id, { $set: orderUpdates }, { new: true, runValidators: true });
};

export const findShipmentForWebhook = async ({ deliveryId, trackingNumber, businessReference }) => {
  if (businessReference) {
    const byOrder = await Shipment.findOne({ order: businessReference });
    if (byOrder) return byOrder;
  }
  if (deliveryId) {
    const byId = await Shipment.findOne({ externalDeliveryId: String(deliveryId) });
    if (byId) return byId;
  }
  if (trackingNumber) {
    return Shipment.findOne({ trackingNumber: String(trackingNumber) });
  }
  return null;
};

export const loadShipmentsForOrders = async (orders) => {
  const ids = orders.map((o) => o._id);
  const shipments = await Shipment.find({ order: { $in: ids } }).lean();
  return new Map(shipments.map((s) => [String(s.order), s]));
};
