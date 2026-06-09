// src/utils/orderTracking.js
import { buildOrderTrackingPayload } from './shipping/tracking.js';
import { loadShipmentsForOrders } from './shipping/shipmentSync.js';
import { buildOrderPresentation } from './shipping/orderPresentation.js';
import { loadOrderItemCounts } from './orderQueryHelpers.js';
export { ORDER_TRACKING_STEPS } from './shipping/tracking.js';
export {
  ORDER_STATUS_LABELS,
  getOrderStatusLabel,
  getPaymentStatusLabel,
  getIsPaid,
  buildOrderPresentation,
} from './shipping/orderPresentation.js';

export const enrichOrderDocument = (order, shipment = null, itemCount = null) => {
  const doc = order?.toObject ? order.toObject() : { ...order };
  if (itemCount != null && doc.itemCount == null) {
    doc.itemCount = itemCount;
  } else if (doc.itemCount == null && Array.isArray(doc.items)) {
    doc.itemCount = doc.items.length;
  }
  const shipmentSummary = shipment
    ? {
        carrier: shipment.carrier,
        carrierName: shipment.carrierName,
        carrierCode: shipment.carrierCode,
        carrierType: shipment.carrierType,
        trackingNumber: shipment.trackingNumber,
        externalDeliveryId: shipment.externalDeliveryId,
        status: shipment.status,
        lastError: shipment.lastError,
        providerStateLabel: shipment.providerStateLabel,
      }
    : null;
  return {
    ...doc,
    ...buildOrderPresentation(doc),
    shipment: shipmentSummary,
    tracking: buildOrderTrackingPayload(doc, shipment),
  };
};

export const enrichOrdersDocuments = async (orders) => {
  if (!orders?.length) return [];
  const needsItemCount = orders.some((o) => !Array.isArray(o.items));
  const itemCountMap = needsItemCount
    ? await loadOrderItemCounts(orders.map((o) => o._id))
    : new Map();
  const shipmentMap = await loadShipmentsForOrders(orders);
  return orders.map((order) =>
    enrichOrderDocument(
      order,
      shipmentMap.get(String(order._id)) ?? null,
      itemCountMap.get(String(order._id))
    )
  );
};
