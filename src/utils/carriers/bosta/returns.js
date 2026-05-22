// src/utils/carriers/bosta/returns.js
import User from '../../../models/User.js';
import CarrierPickup from '../../../models/CarrierPickup.js';
import ApiError from '../../apiError.js';
import {
  bostaRequest,
  formatBostaError,
  getBostaCredentials,
  isUncoveredAddressError,
  normalizeEgyptPhone,
  splitBostaContactName,
} from './client.js';
import {
  buildBostaAddress,
  applyBostaAddressDefaults,
  resolveReturnPickupBostaAddress,
} from './addresses.js';
import { buildBostaSpecs } from './deliveries.js';
import { parseBostaStateParts } from '../bostaStates.js';

/** Bosta API delivery type: customer return pickup (verify against Bosta v2 docs). */
const BOSTA_TYPE_RETURN = 25;

const pickupAddressFromReturn = async (returnRequest, credentials) =>
  resolveReturnPickupBostaAddress(
    returnRequest.pickupAddress,
    returnRequest.carrier,
    credentials
  );

const dropOffFromPickupDoc = (pickupDoc) => {
  if (pickupDoc.bostaLocationId) {
    return { businessLocationId: pickupDoc.bostaLocationId };
  }
  const { address } = pickupDoc ?? {};
  if (!address?.firstLine) {
    throw new ApiError('Drop-off location is missing Bosta address data', 400);
  }
  const addr = buildBostaAddress({
    city: address.city,
    cityId: address.cityId,
    zoneId: address.zoneId,
    districtId: address.districtId,
    districtName: address.districtName,
    firstLine: address.firstLine,
    secondLine: address.secondLine,
  });
  return { dropOffAddress: applyBostaAddressDefaults(addr) };
};

export const createBostaReturnDelivery = async (params, credentials) => {
  const { firstName, lastName } = splitBostaContactName(params.receiverName);
  const body = {
    type: BOSTA_TYPE_RETURN,
    specs: buildBostaSpecs(params.packageSpecs),
    receiver: {
      firstName,
      lastName,
      phone: params.receiverPhone,
      ...(params.receiverEmail ? { email: params.receiverEmail } : {}),
    },
    pickupAddress: params.pickupAddress,
    cod: 0,
    businessReference: params.businessReference,
    uniqueBusinessReference: params.uniqueBusinessReference ?? params.businessReference,
    notes: params.notes ?? '',
    allowToOpenPackage: params.allowToOpenPackage !== false,
  };

  if (params.businessLocationId) {
    body.businessLocationId = params.businessLocationId;
  } else if (params.dropOffAddress) {
    body.dropOffAddress = params.dropOffAddress;
  } else {
    throw new ApiError('Drop-off location is required for Bosta return', 400);
  }

  return bostaRequest('POST', '/api/v2/deliveries?apiVersion=1', body, credentials);
};

export const createBostaReturnForReturnRequest = async (returnRequest, order) => {
  if (returnRequest.logisticsHandler !== 'bosta') {
    throw new ApiError('Return is not assigned to Bosta logistics', 400);
  }

  if (returnRequest.bostaExternalId) {
    return {
      trackingNumber: returnRequest.bostaTrackingNumber,
      externalDeliveryId: returnRequest.bostaExternalId,
      alreadyScheduled: true,
    };
  }

  const carrierId = returnRequest.carrier;
  const credentials = await getBostaCredentials(carrierId);
  if (!credentials?.apiKey) {
    throw new ApiError('Bosta carrier is not configured', 503);
  }

  const pickupDoc = await CarrierPickup.findById(returnRequest.dropOffPickup);
  if (!pickupDoc) {
    throw new ApiError('Drop-off pickup location not found', 404);
  }

  const dropOff = dropOffFromPickupDoc(pickupDoc);

  const user = await User.findById(returnRequest.user).select('name phone email');
  if (!user?.phone) {
    throw new ApiError('Customer phone is required for Bosta return pickup', 400);
  }

  let customerPickup;
  try {
    customerPickup = await pickupAddressFromReturn(returnRequest, credentials);
  } catch (err) {
    if (err instanceof ApiError) throw err;
    if (isUncoveredAddressError(err)) {
      throw new ApiError(
        `${formatBostaError(err)} — Use a Bosta-covered district for customer pickup address.`,
        400
      );
    }
    throw err;
  }

  const itemsDesc =
    returnRequest.items.map((i) => `${i.name} x${i.quantity}`).join(', ').slice(0, 500) ||
    `Return ${returnRequest._id}`;

  const warehouseContact = pickupDoc.contactPerson;
  let apiRes;
  try {
    apiRes = await createBostaReturnDelivery(
      {
        receiverName: warehouseContact?.name || 'Oxxila Warehouse',
        receiverPhone: normalizeEgyptPhone(warehouseContact?.phone || user.phone),
        receiverEmail: warehouseContact?.email || undefined,
        pickupAddress: customerPickup,
        ...dropOff,
        businessReference: `RT-${returnRequest._id}`,
        uniqueBusinessReference: `RT-${returnRequest._id}`,
        notes: returnRequest.logisticsNotes?.trim() || `Return ${returnRequest._id} | Order ${order._id}`,
        packageSpecs: {
          itemsCount: returnRequest.items.reduce((s, i) => s + i.quantity, 0),
          description: itemsDesc,
        },
      },
      credentials
    );
  } catch (err) {
    if (isUncoveredAddressError(err)) {
      throw new ApiError(`${formatBostaError(err)} — Check zones and drop-off location.`, 400);
    }
    throw err;
  }

  const delivery = apiRes.data ?? apiRes;
  const stateParts = parseBostaStateParts(delivery.state);

  return {
    trackingNumber: delivery.trackingNumber ?? delivery.tracking_number ?? null,
    externalDeliveryId: delivery._id ?? delivery.id ?? delivery.deliveryId ?? null,
    providerState: stateParts.code ?? stateParts.label,
    providerStateLabel: stateParts.label,
    alreadyScheduled: false,
  };
};
