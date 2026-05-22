// src/utils/carriers/bosta/webhooks.js
import Carrier from '../../../models/Carrier.js';
import Order from '../../../models/Order.js';
import ReturnRequest from '../../../models/ReturnRequest.js';
import Shipment from '../../../models/Shipment.js';
import { parseBostaStateParts } from '../bostaStates.js';
import { getBostaCredentials } from './client.js';
import { trackBostaDelivery } from './deliveries.js';
import { applyProviderStateToShipment, findShipmentForWebhook } from '../../shipping/shipmentSync.js';

/** Flat Bosta dashboard webhook body or nested delivery payloads. */
export const parseWebhookDelivery = (body) => {
  const raw = body?.delivery ?? body?.data ?? body ?? {};
  const delivery = raw?.delivery ?? raw;

  const state = delivery.state ?? delivery.State ?? body?.state ?? body?.State ?? null;

  return {
    deliveryId:
      delivery._id ??
      delivery.id ??
      delivery.deliveryId ??
      body?._id ??
      body?.deliveryId ??
      null,
    trackingNumber:
      delivery.trackingNumber ??
      delivery.tracking_number ??
      body?.trackingNumber ??
      null,
    state,
    type: delivery.type ?? body?.type ?? null,
    businessReference:
      delivery.businessReference ??
      delivery.business_reference ??
      body?.businessReference ??
      null,
    cod: delivery.cod ?? body?.cod ?? null,
    timeStamp: delivery.timeStamp ?? delivery.timestamp ?? body?.timeStamp ?? null,
    isConfirmedDelivery: delivery.isConfirmedDelivery ?? body?.isConfirmedDelivery ?? null,
    exceptionReason: delivery.exceptionReason ?? body?.exceptionReason ?? null,
    exceptionCode: delivery.exceptionCode ?? body?.exceptionCode ?? null,
    numberOfAttempts: delivery.numberOfAttempts ?? body?.numberOfAttempts ?? null,
  };
};

const handleBostaReturnWebhook = async (parsed) => {
  const ref = String(parsed.businessReference || '');
  if (!ref.startsWith('RT-')) return null;

  const returnId = ref.slice(3);
  if (!returnId) return { handled: false, reason: 'invalid_return_reference' };

  const doc = await ReturnRequest.findById(returnId);
  if (!doc) return { handled: false, reason: 'return_not_found', returnId };

  const stateParts = parseBostaStateParts(parsed.state);
  const updates = {
    bostaState: stateParts.code ?? stateParts.label,
    bostaStateLabel: stateParts.label,
  };
  if (parsed.trackingNumber && !doc.bostaTrackingNumber) {
    updates.bostaTrackingNumber = parsed.trackingNumber;
  }
  if (parsed.deliveryId && !doc.bostaExternalId) {
    updates.bostaExternalId = String(parsed.deliveryId);
  }
  const updated = await ReturnRequest.findByIdAndUpdate(returnId, { $set: updates }, {
    returnDocument: 'after',
    runValidators: true,
  });

  return { handled: true, kind: 'return', returnRequest: updated };
};

export const handleBostaWebhookPayload = async (body) => {
  const parsed = parseWebhookDelivery(body);
  if (parsed.state == null && !parsed.trackingNumber && !parsed.deliveryId) {
    return { handled: false, reason: 'missing_state' };
  }

  const returnResult = await handleBostaReturnWebhook(parsed);
  if (returnResult) return returnResult;

  const shipment = await findShipmentForWebhook(parsed);
  if (!shipment) {
    return { handled: false, reason: 'shipment_not_found', trackingNumber: parsed.trackingNumber };
  }

  const updated = await applyProviderStateToShipment(shipment, parsed.state, {
    source: 'webhook',
    webhook: parsed,
  });

  const order = await Order.findById(updated.order);
  return { handled: true, kind: 'order', order, shipment: updated };
};

export const syncOrderTrackingFromBosta = async (order) => {
  const shipment = await Shipment.findOne({ order: order._id });
  if (!shipment?.trackingNumber || !shipment.carrier) return order;

  const carrier = await Carrier.findById(shipment.carrier);
  if (carrier?.apiProvider !== 'bosta') return order;

  const credentials = await getBostaCredentials(carrier);
  if (!credentials?.apiKey) return order;

  const res = await trackBostaDelivery(shipment.trackingNumber, credentials);
  const delivery = res?.data ?? res;
  const state = delivery?.state ?? delivery?.State;
  await applyProviderStateToShipment(shipment, state, { source: 'api' });
  return Order.findById(order._id);
};
