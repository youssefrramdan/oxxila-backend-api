// src/utils/carriers/assignOrderShipping.js
import CarrierCoverage from '../../models/CarrierCoverage.js';
import District from '../../models/District.js';
import Governorate from '../../models/Governorate.js';
import User from '../../models/User.js';
import CarrierPickup from '../../models/CarrierPickup.js';
import ApiError from '../apiError.js';
import { getBostaCredentials } from './bostaCredentials.js';
import { createBostaDelivery, enrichBostaAddress } from './bosta.js';

const BLOCKED_STATUSES = new Set(['cancelled', 'delivered', 'returned']);

export const assignOrderToCarrier = async (order, carrier, adminUserId, options = {}) => {
  if (BLOCKED_STATUSES.has(order.orderStatus)) {
    throw new ApiError(`Cannot assign carrier to order with status: ${order.orderStatus}`, 400);
  }

  if (order.fulfillment?.carrier) {
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

  const fulfillmentBase = {
    carrier: carrier._id,
    carrierName: carrier.name,
    carrierCode: carrier.code,
    carrierType: carrier.type,
    assignedAt: new Date(),
    assignedBy: adminUserId,
    driverName: options.driverName?.trim() || null,
    driverPhone: options.driverPhone?.trim() || null,
    notes: options.notes?.trim() || null,
    trackingNumber: options.trackingNumber?.trim() || null,
  };

  let orderStatus = options.markShipped === false ? 'processing' : 'shipped';

  if (carrier.type === 'api' && carrier.apiProvider === 'bosta') {
    const credentials = await getBostaCredentials(carrier);
    if (!credentials) {
      throw new ApiError('Bosta API key is not configured for this carrier', 400);
    }

    const defaultPickup = await CarrierPickup.findOne({
      carrier: carrier._id,
      isDefault: true,
    });
    if (!defaultPickup) {
      throw new ApiError('No default Bosta pickup location configured', 400);
    }

    let districtDoc = null;
    if (order.shippingAddress.districtId) {
      districtDoc = await District.findById(order.shippingAddress.districtId);
    }

    if (districtDoc && !districtDoc.bostaApiCovered) {
      throw new ApiError(
        `District ${order.shippingAddress.districtName} is not covered by Bosta API`,
        400
      );
    }

    const governorate = await Governorate.findById(order.shippingAddress.governorateId);

    const dropOffAddress = await enrichBostaAddress(
      {
        city: order.shippingAddress.governorateName,
        zone: order.shippingAddress.districtName,
        firstLine: order.shippingAddress.addressLine,
        cityId: governorate?.bostaCityId || undefined,
        districtId: districtDoc?.bostaDistrictId || undefined,
        districtName:
          !districtDoc?.bostaDistrictId && !order.shippingAddress.isOther
            ? order.shippingAddress.districtName
            : undefined,
      },
      credentials,
      {
        cityName: order.shippingAddress.governorateName,
        districtName: order.shippingAddress.districtName,
        districtId: districtDoc?.bostaDistrictId,
      }
    );

    const user = await User.findById(order.user).select('name phone');
    const receiverPhone = user?.phone;
    if (!receiverPhone) {
      throw new ApiError('Customer phone is required for Bosta delivery', 400);
    }

    const cod = order.paymentMethod === 'cod' ? Math.round(order.totalPrice) : 0;

    const bostaRes = await createBostaDelivery(
      {
        receiverName: user.name,
        receiverPhone,
        dropOffAddress,
        cod,
        businessReference: String(order._id),
        notes: options.notes || '',
        defaultPickupFromDb: defaultPickup,
        packageSpecs: {
          itemsCount: order.items.reduce((s, i) => s + i.quantity, 0),
          description: `Order ${order._id}`,
        },
      },
      credentials
    );

    const delivery = bostaRes.data ?? bostaRes;
    fulfillmentBase.trackingNumber =
      delivery.trackingNumber ??
      delivery.tracking_number ??
      options.trackingNumber ??
      null;
    fulfillmentBase.externalDeliveryId =
      delivery._id ?? delivery.id ?? delivery.deliveryId ?? null;
    fulfillmentBase.bostaState = delivery.state?.value ?? delivery.state ?? null;
    orderStatus = 'shipped';
  } else if (carrier.type === 'known' || carrier.type === 'internal') {
    if (options.markShipped !== true && !fulfillmentBase.trackingNumber) {
      orderStatus = 'processing';
    }
  } else {
    throw new ApiError(`Carrier type ${carrier.type} is not supported for assignment`, 400);
  }

  order.fulfillment = fulfillmentBase;
  order.orderStatus = orderStatus;
  await order.save();

  return order;
};
