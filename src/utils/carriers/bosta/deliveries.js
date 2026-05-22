// src/utils/carriers/bosta/deliveries.js
import ApiError from '../../apiError.js';
import User from '../../../models/User.js';
import { assertBostaDropOffServiceable } from '../../shipping/zoneMapping.js';
import { bostaRequest, formatBostaError, isUncoveredAddressError, normalizeEgyptPhone, splitBostaContactName } from './client.js';
import {
  applyBostaAddressDefaults,
  assertDropOffAddressReady,
  buildBostaAddress,
  buildDropOffFromMapping,
} from './addresses.js';
import { getPickupForAssign } from './pickups.js';
import { parseBostaStateParts } from '../bostaStates.js';

export const normalizeBostaDeliveryApiResult = (apiRes) => {
  const delivery = apiRes?.data ?? apiRes;
  if (!delivery || typeof delivery !== 'object') return null;

  const stateParts = parseBostaStateParts(delivery.state);
  return {
    trackingNumber: delivery.trackingNumber ?? delivery.tracking_number ?? null,
    externalDeliveryId: delivery._id ?? delivery.id ?? delivery.deliveryId ?? null,
    providerState: stateParts.code ?? stateParts.label,
    providerStateLabel: stateParts.label,
  };
};

export const buildBostaSpecs = ({
  packageType = 'Parcel',
  size = 'MEDIUM',
  itemsCount = 1,
  description = 'Shipment',
} = {}) => ({
  packageType,
  size,
  packageDetails: {
    itemsCount: Math.max(1, Number(itemsCount) || 1),
    description: String(description || 'Shipment').trim().slice(0, 500) || 'Shipment',
  },
});

export const resolveDropOffForOrder = async (order, carrierId) => {
  const serviceCheck = await assertBostaDropOffServiceable(carrierId, order);
  if (!serviceCheck.ok) {
    throw new ApiError(serviceCheck.message, 400);
  }

  const dropOff = buildDropOffFromMapping(order.shippingAddress, serviceCheck.mapping);
  if (!dropOff) {
    throw new ApiError(
      'Drop-off address could not be built from zone mapping. Run Bosta zone sync and use a covered district.',
      400
    );
  }

  assertDropOffAddressReady(dropOff);
  return dropOff;
};

const pickupDocToBostaAddress = (pickupDoc) => {
  const { address } = pickupDoc ?? {};
  if (!address?.firstLine) return null;
  return applyBostaAddressDefaults(
    buildBostaAddress({
      city: address.city,
      cityId: address.cityId,
      zoneId: address.zoneId,
      districtId: address.districtId,
      districtName: address.districtName,
      firstLine: address.firstLine,
      secondLine: address.secondLine,
    })
  );
};

export const createBostaDelivery = async (params, credentials) => {
  const { firstName, lastName } = splitBostaContactName(params.receiverName);
  const body = {
    type: 10,
    specs: buildBostaSpecs(params.packageSpecs),
    receiver: {
      firstName,
      lastName,
      phone: params.receiverPhone,
      ...(params.receiverEmail ? { email: params.receiverEmail } : {}),
    },
    dropOffAddress: params.dropOffAddress,
    cod: params.cod,
    businessReference: params.businessReference,
    uniqueBusinessReference: params.uniqueBusinessReference ?? params.businessReference,
    notes: params.notes ?? '',
    allowToOpenPackage: params.allowToOpenPackage === true,
  };

  if (params.goodsAmount != null && params.goodsAmount >= 0) {
    body.goodsInfo = { amount: Math.round(params.goodsAmount) };
  }

  if (params.businessLocationId) {
    body.businessLocationId = params.businessLocationId;
  } else if (params.pickupAddress) {
    body.pickupAddress = params.pickupAddress;
  }

  return bostaRequest('POST', '/api/v2/deliveries?apiVersion=1', body, credentials);
};

/** Single entry: order + carrier → Bosta API + normalized delivery result. */
export const createBostaDeliveryForOrder = async (order, carrier, options, credentials) => {
  const pickup = await getPickupForAssign(carrier._id, options.pickupId);

  const [user, dropOffAddress] = await Promise.all([
    User.findById(order.user).select('name phone email'),
    resolveDropOffForOrder(order, carrier._id),
  ]);

  if (!user?.phone) {
    throw new ApiError('Customer phone is required for Bosta delivery', 400);
  }

  const pickupAddressFromDb = pickup.bostaLocationId ? null : pickupDocToBostaAddress(pickup);
  if (!pickup.bostaLocationId && !pickupAddressFromDb) {
    throw new ApiError(
      'Selected pickup is missing Bosta location id and address IDs. Re-import pickups in carrier settings.',
      400
    );
  }

  const itemsDesc =
    order.items.map((i) => `${i.name} x${i.quantity}`).join(', ').slice(0, 500) ||
    `Order ${order._id}`;
  const payNote =
    order.paymentMethod === 'cod'
      ? `COD ${Math.round(order.totalPrice)} EGP`
      : 'Prepaid';

  let apiRes;
  try {
    apiRes = await createBostaDelivery(
      {
        receiverName: user.name,
        receiverPhone: normalizeEgyptPhone(user.phone),
        receiverEmail: user.email,
        dropOffAddress,
        cod: order.paymentMethod === 'cod' ? Math.min(30000, Math.round(order.totalPrice)) : 0,
        goodsAmount: order.subtotal,
        businessReference: String(order._id),
        uniqueBusinessReference: `OX-${order._id}`,
        notes: options.notes?.trim() || `Oxxila ${order._id} | ${payNote}`,
        businessLocationId: pickup.bostaLocationId || undefined,
        pickupAddress: pickupAddressFromDb || undefined,
        packageSpecs: {
          itemsCount: order.items.reduce((s, i) => s + i.quantity, 0),
          description: itemsDesc,
          size: options.size || 'MEDIUM',
        },
      },
      credentials
    );
  } catch (err) {
    if (isUncoveredAddressError(err)) {
      throw new ApiError(
        `${formatBostaError(err)} — Sync Bosta zones, use a covered district, and pick a valid pickup location.`,
        400
      );
    }
    throw err;
  }

  const normalized = normalizeBostaDeliveryApiResult(apiRes);
  if (!normalized) {
    throw new ApiError('Bosta returned an empty delivery response', 502);
  }
  return { ...normalized, raw: apiRes.data ?? apiRes };
};

export const trackBostaDelivery = async (trackingNumber, credentials) =>
  bostaRequest('GET', `/api/v2/deliveries/tracking/${trackingNumber}`, null, credentials);

export const cancelBostaDelivery = async (deliveryId, credentials) =>
  bostaRequest('DELETE', `/api/v2/deliveries/${deliveryId}`, null, credentials);
