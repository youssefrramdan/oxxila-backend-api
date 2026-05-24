// src/utils/carriers/assignOrderShipping.js
import CarrierCoverage from '../../models/CarrierCoverage.js';
import Shipment from '../../models/Shipment.js';
import ApiError from '../apiError.js';
import { createBostaDeliveryForOrder } from './bosta/deliveries.js';
import { getBostaCredentials, formatBostaError, isUncoveredAddressError } from './bosta/client.js';
import { mapBostaStateToOrderStatus } from './bostaStates.js';
import { appendShipmentEvent, syncOrderFromShipment } from '../shipping/shipmentSync.js';
import { generateManualTrackingNumber } from '../shipping/generateTrackingNumber.js';

const BLOCKED_STATUSES = new Set(['cancelled', 'delivered']);

const isCommittedCarrierAssignment = (shipment) => {
  if (!shipment?.carrier) return false;
  if (shipment.carrierType === 'api') {
    return Boolean(shipment.externalDeliveryId);
  }
  if (shipment.carrierType === 'known' || shipment.carrierType === 'internal') {
    return Boolean(shipment.trackingNumber);
  }
  return Boolean(shipment.externalDeliveryId || shipment.trackingNumber);
};

const clearShipmentCarrier = (shipment) => {
  shipment.carrier = null;
  shipment.carrierName = null;
  shipment.carrierCode = null;
  shipment.carrierType = null;
  shipment.assignedAt = null;
  shipment.assignedBy = null;
  shipment.driverName = null;
  shipment.driverPhone = null;
  shipment.trackingNumber = null;
  shipment.externalDeliveryId = null;
  shipment.providerState = null;
  shipment.providerStateLabel = null;
};

const applyShipmentCarrier = (shipment, carrier, adminUserId, options) => {
  shipment.carrier = carrier._id;
  shipment.carrierName = carrier.name;
  shipment.carrierCode = carrier.code;
  shipment.carrierType = carrier.type;
  shipment.assignedAt = new Date();
  shipment.assignedBy = adminUserId;
  shipment.driverName = options.driverName?.trim() || null;
  shipment.driverPhone = options.driverPhone?.trim() || null;
  shipment.notes = options.notes?.trim() || null;
  shipment.trackingNumber = options.trackingNumber?.trim() || shipment.trackingNumber;
};

export const assignOrderToCarrier = async (order, carrier, adminUserId, options = {}) => {
  if (BLOCKED_STATUSES.has(order.orderStatus)) {
    throw new ApiError(`Cannot assign carrier to order with status: ${order.orderStatus}`, 400);
  }

  const existingShipment = await Shipment.findOne({ order: order._id });
  if (isCommittedCarrierAssignment(existingShipment)) {
    throw new ApiError('Order already has a carrier assigned', 400);
  }

  const coverage = await CarrierCoverage.findOne({
    carrier: carrier._id,
    governorate: order.shippingAddress.governorateId,
    isActive: true,
  });
  if (!coverage) {
    throw new ApiError(
      `Carrier ${carrier.name} does not cover governorate: ${order.shippingAddress.governorateName}`,
      400
    );
  }

  let shipment =
    existingShipment ??
    (await Shipment.create({
      order: order._id,
      status: 'pending_assignment',
      methodSnapshot: {
        methodName: order.shipping?.methodName ?? 'Standard delivery',
        price: order.shippingPrice,
      },
    }));

  if (existingShipment?.carrier && !isCommittedCarrierAssignment(existingShipment)) {
    clearShipmentCarrier(shipment);
  }

  let orderStatus = options.markShipped === false ? 'processing' : 'shipped';

  if (carrier.type === 'api' && carrier.apiProvider === 'bosta') {
    if (!options.pickupId) {
      throw new ApiError('Select a pickup location for Bosta assignment', 400);
    }
    const credentials = await getBostaCredentials(carrier);
    if (!credentials) {
      throw new ApiError('Bosta API key is not configured for this carrier', 400);
    }

    try {
      const result = await createBostaDeliveryForOrder(order, carrier, options, credentials);
      applyShipmentCarrier(shipment, carrier, adminUserId, options);
      shipment.trackingNumber = result.trackingNumber ?? options.trackingNumber ?? null;
      shipment.externalDeliveryId = result.externalDeliveryId;
      shipment.providerState = result.providerState;
      shipment.providerStateLabel = result.providerStateLabel;
      shipment.status = 'submitted';
      shipment.attemptCount = (shipment.attemptCount || 0) + 1;
      shipment.lastError = null;

      appendShipmentEvent(shipment, {
        code: result.providerState,
        label: result.providerStateLabel ?? 'Submitted to Bosta',
        source: 'api',
      });
    } catch (err) {
      const bostaMsg = formatBostaError(err);
      clearShipmentCarrier(shipment);
      shipment.lastError = bostaMsg;
      shipment.attemptCount = (shipment.attemptCount || 0) + 1;
      shipment.status = 'pending_assignment';
      await shipment.save();
      if (err instanceof ApiError) {
        throw err;
      }
      if (isUncoveredAddressError(err) || err.statusCode === 400) {
        throw new ApiError(bostaMsg, 400);
      }
      throw new ApiError(bostaMsg, err.statusCode || 502);
    }

    orderStatus =
      mapBostaStateToOrderStatus(shipment.providerState, 'processing') ?? 'processing';
  } else if (carrier.type === 'known' || carrier.type === 'internal') {
    applyShipmentCarrier(shipment, carrier, adminUserId, options);
    if (!shipment.trackingNumber) {
      shipment.trackingNumber = await generateManualTrackingNumber(order, carrier);
    }
    shipment.status = options.markShipped === false ? 'pending_assignment' : 'submitted';
    appendShipmentEvent(shipment, {
      code: 'submitted',
      label: 'Shipment registered',
      source: 'manual',
    });
    if (options.markShipped !== true) {
      orderStatus = 'processing';
    } else {
      orderStatus = 'shipped';
    }
  } else {
    throw new ApiError(`Carrier type ${carrier.type} is not supported for assignment`, 400);
  }

  await shipment.save();
  order.orderStatus = orderStatus;
  await order.save();
  await syncOrderFromShipment(shipment);

  return order;
};
