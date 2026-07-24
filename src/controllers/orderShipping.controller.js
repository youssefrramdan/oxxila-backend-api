// src/controllers/orderShipping.controller.js
import asyncHandler from 'express-async-handler';
import Order from '../models/Order.js';
import Carrier from '../models/Carrier.js';
import CarrierCoverage from '../models/CarrierCoverage.js';
import CarrierZoneMapping from '../models/CarrierZoneMapping.js';
import CarrierPickup from '../models/CarrierPickup.js';
import District from '../models/District.js';
import Shipment from '../models/Shipment.js';
import User from '../models/User.js';
import ShippingMethodSetting from '../models/ShippingMethodSetting.js';
import ApiError from '../utils/apiError.js';
import sendResponse from '../utils/apiResponse.js';
import logger from '../config/logger.js';
import { getPickupForAssign, pickupDocToBostaAddress } from './carrierPickup.controller.js';

/** Convert a Mongoose doc to a plain object when needed. */
const toPlainDoc = (doc) => (typeof doc?.toObject === 'function' ? doc.toObject() : doc);

// --- Bosta constants ---

const BOSTA_DEFAULT_BASE_URL = 'https://app.bosta.co';
const BOSTA_DELIVERY_PATH = '/api/v2/deliveries?apiVersion=1';
export const BOSTA_DELIVERY_TYPE_OUTBOUND = 10;
// Customer-return-pickup type used by Bosta v2; re-verify against Bosta's docs if return
// delivery creation ever starts failing with a type-related error.
export const BOSTA_DELIVERY_TYPE_RETURN = 25;
const BOSTA_COD_MAX_EGP = 30000;
const BOSTA_DISTRICTS_CACHE_MS = 5 * 60 * 1000;
const BLOCKED_ASSIGN_ORDER_STATUSES = new Set(['cancelled', 'delivered']);
const MANUAL_CARRIER_TYPES = new Set(['known', 'internal']);
const MANUAL_ORDER_STATUSES = [
  'processing',
  'shipped',
  'out_for_delivery',
  'failed_attempt',
  'delivered',
  'returned',
  'cancelled',
];
const ORDER_TO_SHIPMENT_STATUS = {
  processing: 'submitted',
  shipped: 'in_transit',
  out_for_delivery: 'out_for_delivery',
  failed_attempt: 'failed',
  delivered: 'delivered',
  returned: 'cancelled',
  cancelled: 'cancelled',
};
const MANUAL_STATUS_LABELS = {
  processing: 'Preparing shipment',
  shipped: 'On the way',
  out_for_delivery: 'Out for delivery',
  failed_attempt: 'Delivery attempt failed',
  delivered: 'Delivered',
  returned: 'Returned',
  cancelled: 'Cancelled',
};

// --- Bosta HTTP client ---

/** Strip trailing slashes and /api/v2 from a Bosta API base URL. */
export const normalizeBostaBaseUrl = (apiBaseUrl) => {
  let base = String(apiBaseUrl || BOSTA_DEFAULT_BASE_URL).trim();
  if (!base) base = BOSTA_DEFAULT_BASE_URL;
  return base.replace(/\/+$/, '').replace(/\/api\/v2$/i, '');
};

/** Load Bosta apiKey + base URL for an API carrier, or null if not configured. */
export const getBostaCredentials = async (carrierOrId) => {
  const id = carrierOrId?._id ?? carrierOrId;
  const carrier = await Carrier.findById(id).select('+apiKey +apiBaseUrl');
  if (!carrier?.apiKey?.trim()) return null;
  if (carrier.apiProvider !== 'bosta' || carrier.type !== 'api') return null;

  return {
    apiKey: carrier.apiKey.trim(),
    apiBaseUrl: normalizeBostaBaseUrl(carrier.apiBaseUrl),
  };
};

/** Shared Bosta-carrier lookup guard — used by this controller plus carrier/carrierPickup controllers. */
export const getBostaCarrierContext = async (carrierId) => {
  const carrier = await Carrier.findById(carrierId).select('+apiKey +apiBaseUrl');
  if (!carrier) throw new ApiError(`No carrier found with id: ${carrierId}`, 404);
  if (carrier.apiProvider !== 'bosta' || carrier.type !== 'api') {
    throw new ApiError('Carrier is not a Bosta API carrier', 400);
  }
  const credentials = await getBostaCredentials(carrier);
  if (!credentials) throw new ApiError('Bosta API key is not configured', 400);
  return { carrier, credentials };
};

/** Split a full name into Bosta firstName / lastName fields. */
export const splitBostaContactName = (fullName) => {
  const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
  const firstName = parts[0] || 'Contact';
  const lastName = parts.slice(1).join(' ') || firstName;
  return { firstName, lastName };
};

/** Normalize an Egypt phone number to +20… form for Bosta. */
export const normalizeEgyptPhone = (phone) => {
  const raw = String(phone || '').trim();
  if (!raw) return '';
  if (raw.startsWith('+20')) return raw;
  if (raw.startsWith('20') && raw.length >= 12) return `+${raw}`;
  if (raw.startsWith('0')) return `+20${raw.slice(1)}`;
  return raw;
};

/** Extract a human-readable message from a Bosta/ApiError response. */
export const formatBostaError = (err) => {
  const msg =
    err?.bostaError?.message ??
    err?.bostaError?.errorMessage ??
    err?.message ??
    'Bosta request failed';
  return String(msg);
};

/** True when Bosta rejected the address as uncovered drop-off/pickup. */
export const isUncoveredAddressError = (err) =>
  /uncovered drop-off or pickup/i.test(formatBostaError(err));

/** Perform an authenticated Bosta HTTP request and throw ApiError on failure. */
export const bostaRequest = async (method, path, body, { apiKey, apiBaseUrl }) => {
  const base = apiBaseUrl.replace(/\/$/, '');
  const options = {
    method,
    headers: {
      Authorization: apiKey?.trim(),
      'Content-Type': 'application/json',
    },
  };
  if (body !== undefined && body !== null) {
    options.body = JSON.stringify(body);
  }

  const res = await fetch(`${base}${path}`, options);
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const message = data?.message || data?.error || data?.errorMessage || 'Bosta request failed';
    const err = new ApiError(message, res.status);
    err.bostaError = data;
    throw err;
  }

  return data;
};

// --- Bosta address builders ---

/** Fill Bosta address defaults (secondLine, floor, apartment, buildingNumber). */
export const applyBostaAddressDefaults = (addr = {}) => {
  const out = { ...addr };
  const zoneLabel = String(out.districtName || out.city || '').trim();
  if (!out.secondLine && zoneLabel) out.secondLine = zoneLabel;
  if (!out.floor) out.floor = '1';
  if (!out.apartment) out.apartment = '1';
  if (!out.buildingNumber) out.buildingNumber = '1';
  return out;
};

/** Build a Bosta-shaped address object from zone/district fields. */
export const buildBostaAddress = ({
  city,
  cityId,
  zoneId,
  districtId,
  districtName,
  firstLine,
  secondLine,
  floor,
  apartment,
  buildingNumber,
} = {}) => {
  const addr = {
    city: String(city || '').trim(),
    firstLine: String(firstLine || '').trim(),
  };
  const cid = String(cityId || '').trim();
  const zid = String(zoneId || '').trim();
  const distId = String(districtId || '').trim();
  const label = String(districtName || '').trim();

  if (cid) addr.cityId = cid;
  if (zid) addr.zoneId = zid;
  if (distId) addr.districtId = distId;
  else if (label && cid) addr.districtName = label;

  if (secondLine) addr.secondLine = String(secondLine).trim();
  if (floor) addr.floor = String(floor).trim();
  if (apartment) addr.apartment = String(apartment).trim();
  if (buildingNumber) addr.buildingNumber = String(buildingNumber).trim();
  return addr;
};

/** Build drop-off from CarrierZoneMapping — no fuzzy API match (avoids wrong district). */
export const buildDropOffFromMapping = (shippingAddress, mapping) => {
  const { governorateName, districtName, addressLine, isOther } = shippingAddress;

  if (mapping?.externalDistrictId && mapping?.externalCityId) {
    return applyBostaAddressDefaults(
      buildBostaAddress({
        city: governorateName,
        cityId: mapping.externalCityId,
        zoneId: mapping.externalZoneId || undefined,
        districtId: mapping.externalDistrictId,
        firstLine: addressLine,
      })
    );
  }

  if (mapping?.externalCityId && isOther) {
    return applyBostaAddressDefaults(
      buildBostaAddress({
        city: governorateName,
        cityId: mapping.externalCityId,
        zoneId: mapping.externalZoneId || undefined,
        districtName: districtName !== 'Other' ? districtName : undefined,
        firstLine: addressLine,
      })
    );
  }

  return null;
};

/** Validate that a Bosta drop-off address has enough IDs/line length. */
export const assertDropOffAddressReady = (addr) => {
  if (String(addr?.firstLine || '').trim().length < 6) {
    throw new ApiError('Customer address must be at least 6 characters for Bosta', 400);
  }
  if (!addr?.districtId && !(addr?.districtName && addr?.cityId)) {
    throw new ApiError(
      'Bosta drop-off address is incomplete. Sync Bosta zones and use a covered district.',
      400
    );
  }
};

// --- Bosta district fetch/match ---

let cityDistrictsCache = { list: null, fetchedAt: 0 };

/** Lowercase/trim a label for fuzzy district/city matching. */
const normalizeLabel = (value) => String(value || '').trim().toLowerCase();

/** Extract the cities/districts array from a Bosta cities API response. */
const parseCityDistrictList = (res) => {
  const raw = res.data?.list ?? res.data?.cities ?? res.data ?? res.cities ?? res;
  return Array.isArray(raw) ? raw : [];
};

/** Fetch (and short-cache) Bosta city→districts list for matching. */
export const fetchBostaCityDistricts = async (credentials) => {
  if (cityDistrictsCache.list && Date.now() - cityDistrictsCache.fetchedAt < BOSTA_DISTRICTS_CACHE_MS) {
    return cityDistrictsCache.list;
  }

  for (const path of ['/api/v2/cities/getAllDistricts', '/api/v2/cities']) {
    try {
      const res = await bostaRequest('GET', path, null, credentials);
      const list = parseCityDistrictList(res);
      if (list.length > 0 && list[0]?.districts) {
        cityDistrictsCache = { list, fetchedAt: Date.now() };
        return list;
      }
    } catch (err) {
      if (err.statusCode === 401 || err.statusCode === 403) throw err;
    }
  }
  return [];
};

/** Fuzzy-match a city+district name against Bosta cities list. */
export const matchBostaDistrict = (cities, { cityName, districtName }) => {
  const cityNeedle = normalizeLabel(cityName);
  const distNeedle = normalizeLabel(districtName);
  if (!cityNeedle || !distNeedle || distNeedle === 'other') return null;

  const city = cities.find(
    (c) =>
      normalizeLabel(c.cityName) === cityNeedle ||
      normalizeLabel(c.cityOtherName) === cityNeedle ||
      normalizeLabel(c.cityCode) === cityNeedle
  );
  if (!city?.districts?.length) return null;

  const district = city.districts.find(
    (d) =>
      normalizeLabel(d.districtName) === distNeedle ||
      normalizeLabel(d.districtOtherName) === distNeedle ||
      normalizeLabel(d.zoneName) === distNeedle ||
      normalizeLabel(d.zoneOtherName) === distNeedle
  );
  if (!district?.districtId) return null;

  return {
    cityId: city.cityId,
    cityName: city.cityName,
    zoneId: district.zoneId,
    zoneName: district.zoneName,
    districtId: district.districtId,
    districtName: district.districtName,
  };
};

/** Find a Bosta district by external districtId across cities. */
export const matchBostaDistrictById = (cities, districtId) => {
  const id = String(districtId || '').trim();
  if (!id) return null;

  for (const city of cities) {
    const district = city.districts?.find((d) => d.districtId === id);
    if (!district) continue;
    return {
      cityId: city.cityId,
      cityName: city.cityName,
      zoneId: district.zoneId,
      zoneName: district.zoneName,
      districtId: district.districtId,
      districtName: district.districtName,
    };
  }
  return null;
};

/** Resolve Bosta district by id first, then by city/district names. */
export const resolveBostaDistrictMatch = async (credentials, { cityName, districtName, districtId }) => {
  const cities = await fetchBostaCityDistricts(credentials);
  if (districtId) {
    const byId = matchBostaDistrictById(cities, districtId);
    if (byId) return byId;
  }
  if (cityName && districtName) {
    return matchBostaDistrict(cities, { cityName, districtName });
  }
  return null;
};

/** Enrich an address with Bosta city/zone/district IDs when missing. */
export const enrichBostaAddress = async (addr, credentials, hints = {}) => {
  if (!addr || hints.skipEnrich) return addr;

  const cityId = String(hints.cityId || addr.cityId || '').trim();
  const districtId = String(hints.districtId || addr.districtId || '').trim();

  if (districtId && cityId) {
    return applyBostaAddressDefaults(
      buildBostaAddress({
        city: addr.city,
        cityId,
        zoneId: hints.zoneId || addr.zoneId,
        districtId,
        firstLine: addr.firstLine,
        secondLine: addr.secondLine,
      })
    );
  }

  let matched = null;
  if (credentials) {
    matched = await resolveBostaDistrictMatch(credentials, {
      cityName: hints.cityName || addr.city,
      districtName: hints.districtName || addr.districtName,
      districtId: hints.districtId || addr.districtId,
    });
  }

  const districtLabel = matched?.districtName || hints.districtName || addr.districtName;

  return applyBostaAddressDefaults(
    buildBostaAddress({
      city: matched?.cityName || addr.city,
      cityId: matched?.cityId || cityId || undefined,
      zoneId: matched?.zoneId || addr.zoneId || undefined,
      districtId: matched?.districtId || districtId || undefined,
      districtName: matched?.districtId || districtId ? undefined : districtLabel,
      firstLine: addr.firstLine,
      secondLine: addr.secondLine,
    })
  );
};

// --- Bosta zone/drop-off serviceability ---

/** Load a serviceable CarrierZoneMapping for district or governorate. */
export const getCarrierZoneMapping = async (carrierId, { governorateId, districtId } = {}) => {
  if (districtId) {
    const districtMapping = await CarrierZoneMapping.findOne({
      carrier: carrierId,
      zoneType: 'district',
      zoneId: districtId,
      isServiceable: true,
    }).lean();
    if (districtMapping) return districtMapping;
  }

  if (governorateId) {
    return CarrierZoneMapping.findOne({
      carrier: carrierId,
      zoneType: 'governorate',
      zoneId: governorateId,
      isServiceable: true,
    }).lean();
  }

  return null;
};

/** Throws ApiError with a specific reason instead of returning an { ok, message } tuple. */
export const assertBostaDropOffServiceable = async (carrierId, order) => {
  const { governorateId, districtId, isOther } = order.shippingAddress;

  if (districtId && !isOther) {
    const district = await District.findById(districtId).select('isCovered bostaCovered name');
    if (!district?.isCovered) {
      throw new ApiError(`District ${order.shippingAddress.districtName} is not covered`, 400);
    }
    if (!district.bostaCovered) {
      throw new ApiError('District not covered by Bosta — cannot assign', 400);
    }
    const mapping = await getCarrierZoneMapping(carrierId, { governorateId, districtId });
    if (!mapping?.externalDistrictId && !mapping?.externalCityId) {
      throw new ApiError(
        `District ${district.name} has no Bosta mapping. Run zone sync in shipping admin.`,
        400
      );
    }
    if (mapping.dropOffAvailable === false) {
      throw new ApiError(`District ${district.name} is not available for Bosta drop-off`, 400);
    }
    return mapping;
  }

  const govMapping = await getCarrierZoneMapping(carrierId, { governorateId });
  if (!govMapping?.externalCityId) {
    throw new ApiError(
      'Governorate has no Bosta city mapping. Run zone sync or select a covered district.',
      400
    );
  }
  return govMapping;
};

/** Build and validate the Bosta drop-off address for an order. */
export const resolveDropOffForOrder = async (order, carrierId) => {
  const mapping = await assertBostaDropOffServiceable(carrierId, order);
  const dropOff = buildDropOffFromMapping(order.shippingAddress, mapping);
  if (!dropOff) {
    throw new ApiError(
      'Drop-off address could not be built from zone mapping. Run Bosta zone sync and use a covered district.',
      400
    );
  }
  assertDropOffAddressReady(dropOff);
  return dropOff;
};

// --- Bosta delivery body builder (shared by outbound + return deliveries) ---

/** Build Bosta package specs (type, size, itemsCount, description). */
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

/** Shared request-body builder for both outbound (type 10) and return (type 25) deliveries. */
export const buildBostaDeliveryBody = ({
  type,
  packageSpecs,
  receiverName,
  receiverPhone,
  receiverEmail,
  cod = 0,
  goodsAmount,
  businessReference,
  uniqueBusinessReference,
  notes,
  allowToOpenPackage = true,
  businessLocationId,
  dropOffAddress,
  pickupAddress,
}) => {
  const { firstName, lastName } = splitBostaContactName(receiverName);
  const body = {
    type,
    specs: buildBostaSpecs(packageSpecs),
    receiver: {
      firstName,
      lastName,
      phone: receiverPhone,
      ...(receiverEmail ? { email: receiverEmail } : {}),
    },
    cod,
    businessReference,
    uniqueBusinessReference: uniqueBusinessReference ?? businessReference,
    notes: notes ?? '',
    allowToOpenPackage: allowToOpenPackage === true,
  };

  if (goodsAmount != null && goodsAmount >= 0) {
    body.goodsInfo = { amount: Math.round(goodsAmount) };
  }

  // Outbound needs both: pickup (businessLocationId / pickupAddress) + customer dropOff.
  // Returns usually send only one of businessLocationId or dropOffAddress (merchant destination).
  if (businessLocationId) body.businessLocationId = businessLocationId;
  if (dropOffAddress) body.dropOffAddress = dropOffAddress;
  if (pickupAddress) body.pickupAddress = pickupAddress;

  return body;
};

/** Shared low-level POST used by both outbound and return delivery creation. */
export const postBostaDelivery = (body, credentials) =>
  bostaRequest('POST', BOSTA_DELIVERY_PATH, body, credentials);

/** Normalize a Bosta create-delivery response into tracking fields. */
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

/** GET Bosta tracking details for a delivery tracking number. */
export const trackBostaDelivery = (trackingNumber, credentials) =>
  bostaRequest('GET', `/api/v2/deliveries/tracking/${trackingNumber}`, null, credentials);

// --- outbound delivery orchestration (order → Bosta) ---

/** Convert a CarrierPickup doc into a Bosta pickupAddress payload. */
const pickupDocToPickupAddress = (pickupDoc) => {
  const { address } = pickupDoc ?? {};
  if (!address?.firstLine) return null;
  return applyBostaAddressDefaults(pickupDocToBostaAddress(pickupDoc) ?? {});
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

  const pickupAddressFromDb = pickup.bostaLocationId ? null : pickupDocToPickupAddress(pickup);
  if (!pickup.bostaLocationId && !pickupAddressFromDb) {
    throw new ApiError(
      'Selected pickup is missing Bosta location id and address IDs. Re-import pickups in carrier settings.',
      400
    );
  }

  const itemsDesc =
    order.items.map((i) => `${i.name} x${i.quantity}`).join(', ').slice(0, 500) ||
    `Order ${order._id}`;
  const payNote = order.paymentMethod === 'cod' ? `COD ${Math.round(order.totalPrice)} EGP` : 'Prepaid';

  const body = buildBostaDeliveryBody({
    type: BOSTA_DELIVERY_TYPE_OUTBOUND,
    packageSpecs: {
      itemsCount: order.items.reduce((s, i) => s + i.quantity, 0),
      description: itemsDesc,
      size: options.size || 'MEDIUM',
    },
    receiverName: user.name,
    receiverPhone: normalizeEgyptPhone(user.phone),
    receiverEmail: user.email,
    dropOffAddress,
    cod: order.paymentMethod === 'cod' ? Math.min(BOSTA_COD_MAX_EGP, Math.round(order.totalPrice)) : 0,
    goodsAmount: order.subtotal,
    businessReference: String(order._id),
    uniqueBusinessReference: `OX-${order._id}`,
    notes: options.notes?.trim() || `Oxxila ${order._id} | ${payNote}`,
    // Default to allowing the customer to inspect the package before paying COD, matching the
    // return-pickup flow — admins can still opt out per assignment via allowToOpenPackage: false.
    allowToOpenPackage: options.allowToOpenPackage !== false,
    businessLocationId: pickup.bostaLocationId || undefined,
    pickupAddress: pickup.bostaLocationId ? undefined : pickupAddressFromDb,
  });

  let apiRes;
  try {
    apiRes = await postBostaDelivery(body, credentials);
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

// --- Bosta state maps ---

export const ORDER_STATUS_RANK = {
  pending: 1,
  confirmed: 2,
  processing: 3,
  shipped: 4,
  failed_attempt: 5,
  out_for_delivery: 6,
  returned: 7,
  delivered: 8,
  cancelled: 0,
};

/** Webhook-only mapping: Bosta state code → orderStatus. */
const BOSTA_WEBHOOK_ORDER_STATUS = {
  10: 'processing',
  20: 'processing',
  21: 'processing',
  24: 'shipped',
  30: 'shipped',
  41: 'out_for_delivery',
  45: 'delivered',
  46: 'returned',
  47: 'failed_attempt',
  48: 'cancelled',
  49: 'cancelled',
  100: 'cancelled',
  101: 'cancelled',
};

const FORCE_ORDER_STATUS = new Set(['delivered', 'cancelled', 'returned', 'failed_attempt']);

/** Official Bosta webhook state codes (dashboard shipment status). */
export const BOSTA_STATE_LABELS = {
  10: 'Pickup requested',
  11: 'Waiting for route',
  20: 'Route assigned',
  21: 'Picked up from business',
  22: 'Picking up from consignee',
  23: 'Picked up from consignee',
  24: 'Received at warehouse',
  25: 'Fulfilled',
  30: 'In transit between hubs',
  40: 'Picking up',
  41: 'Out for delivery',
  45: 'Delivered',
  46: 'Returned to business',
  47: 'Exception',
  48: 'Terminated',
  49: 'Canceled',
  60: 'Returned to stock',
  100: 'Lost',
  101: 'Damaged',
  102: 'Investigation',
  103: 'Awaiting your action',
  104: 'Archived',
  105: 'On hold',
};

const BOSTA_SUBMITTED_STATES = new Set(['10', '11', '20']);
const BOSTA_PICKUP_STATES = new Set(['21', '22', '23', '40']);
const BOSTA_OUT_FOR_DELIVERY_STATES = new Set(['41']);
const BOSTA_IN_TRANSIT_STATES = new Set(['24', '25', '30', '102', '105']);
const BOSTA_DELIVERED_STATES = new Set(['45']);
const BOSTA_RETURNED_STATES = new Set(['46', '60']);
const BOSTA_EXCEPTION_STATES = new Set(['47']);
export const BOSTA_CANCELLED_STATES = new Set([
  '48',
  '49',
  '100',
  '101',
  '104',
  'CANCELLED',
  'CANCELED',
  'TERMINATED',
  'LOST',
  'DAMAGED',
  'ARCHIVED',
]);

/** Normalize a Bosta state value/object into a code string. */
export const normalizeBostaState = (state) => {
  if (state == null) return null;
  if (typeof state === 'object') {
    const v = state.value ?? state.name ?? state.code;
    if (v != null) return normalizeBostaState(v);
    return null;
  }
  const s = String(state).trim();
  if (!s) return null;
  if (/^\d+$/.test(s)) return s;
  return s.replace(/\s+/g, '_').toUpperCase();
};

/** Map a Bosta state code to its official label, if known. */
export const getBostaStateLabel = (state) => {
  const code = normalizeBostaState(state);
  if (!code) return null;
  return BOSTA_STATE_LABELS[code] ?? null;
};

/** Parse Bosta state into { code, label } parts. */
export const parseBostaStateParts = (state) => {
  if (state == null) return { code: null, label: null };
  if (typeof state === 'object') {
    const code = state.code != null ? String(state.code) : normalizeBostaState(state);
    return { code, label: state.value ?? state.name ?? getBostaStateLabel(code) };
  }
  const code = normalizeBostaState(state);
  return { code, label: getBostaStateLabel(code) ?? String(state) };
};

/** Map a Bosta webhook state code to an orderStatus (no rank merge). */
export const mapBostaWebhookToOrderStatus = (bostaState) => {
  const code = normalizeBostaState(bostaState);
  if (!code) return null;

  const status = BOSTA_WEBHOOK_ORDER_STATUS[code];
  if (status) return status;

  if (/^\d+$/.test(code)) {
    logger.warn(`Unknown Bosta webhook state code: ${code}`);
  }
  return null;
};

/** Prefer the higher-ranked order status between current and next. */
export const pickHigherOrderStatus = (current, next) => {
  if (!next) return current;
  const a = ORDER_STATUS_RANK[current] ?? 0;
  const b = ORDER_STATUS_RANK[next] ?? 0;
  return b >= a ? next : current;
};

/** Map Bosta state → orderStatus, merging with current via rank rules. */
export const mapBostaStateToOrderStatus = (bostaState, currentStatus = 'pending') => {
  const next = mapBostaWebhookToOrderStatus(bostaState);
  if (!next) return null;
  if (FORCE_ORDER_STATUS.has(next)) return next;
  return pickHigherOrderStatus(currentStatus, next);
};

/** Map Bosta state to a coarse logistics phase string. */
export const mapBostaStateToPhase = (bostaState) => {
  const s = normalizeBostaState(bostaState);
  if (!s) return null;
  if (BOSTA_CANCELLED_STATES.has(s)) return 'cancelled';
  if (BOSTA_RETURNED_STATES.has(s)) return 'returned';
  if (BOSTA_DELIVERED_STATES.has(s)) return 'delivered';
  if (BOSTA_EXCEPTION_STATES.has(s)) return 'exception';
  if (BOSTA_OUT_FOR_DELIVERY_STATES.has(s)) return 'out_for_delivery';
  if (BOSTA_IN_TRANSIT_STATES.has(s)) return 'in_transit';
  if (BOSTA_PICKUP_STATES.has(s)) return 'handed_over';
  if (BOSTA_SUBMITTED_STATES.has(s)) return 'placed';
  return null;
};

/** Map Bosta state to Shipment.status via logistics phase. */
export const mapBostaStateToShipmentStatus = (bostaState, current = 'pending_assignment') => {
  const phase = mapBostaStateToPhase(bostaState);
  if (!phase) return null;
  const map = {
    placed: 'submitted',
    handed_over: 'picked_up',
    in_transit: 'in_transit',
    out_for_delivery: 'out_for_delivery',
    delivered: 'delivered',
    returned: 'cancelled',
    cancelled: 'cancelled',
    exception: 'failed',
  };
  return map[phase] ?? current;
};

// --- shipment sync (Bosta state → Shipment/Order) ---

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

/** Prefer the higher-ranked shipment status between current and next. */
const pickHigherShipmentStatus = (current, next) => {
  if (!next) return current;
  const a = SHIPMENT_STATUS_RANK[current] ?? 0;
  const b = SHIPMENT_STATUS_RANK[next] ?? 0;
  return b >= a ? next : current;
};

/** Append a capped timeline event onto a shipment document. */
export const appendShipmentEvent = (shipment, { code, label, source = 'webhook' }) => {
  if (!code && !label) return;
  shipment.events.push({ at: new Date(), code: code ?? null, label: label ?? null, source });
  if (shipment.events.length > 50) {
    shipment.events = shipment.events.slice(-50);
  }
};

/** Build an NDR/exception note string from webhook payload fields. */
const buildWebhookNotes = (webhook) => {
  if (!webhook?.exceptionReason && webhook?.exceptionCode == null) return null;
  const parts = [];
  if (webhook.exceptionCode != null) parts.push(`NDR ${webhook.exceptionCode}`);
  if (webhook.exceptionReason) parts.push(webhook.exceptionReason);
  return parts.join(': ') || null;
};

/** Sync Order.orderStatus (and COD/paid fields) from shipment provider state. */
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
    if (reason) orderUpdates['fulfillment.exceptionReason'] = reason;
    const currentAttempts = order.fulfillment?.attempts ?? 0;
    orderUpdates['fulfillment.attempts'] = currentAttempts + 1;
  }

  if (Object.keys(orderUpdates).length === 0) return order;

  return Order.findByIdAndUpdate(order._id, { $set: orderUpdates }, { new: true, runValidators: true });
};

/** Apply provider state to shipment, append event, and sync the order. */
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

/** Locate a shipment by businessReference, deliveryId, or trackingNumber. */
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

/** Load shipments for a list of orders keyed by order id string. */
export const loadShipmentsForOrders = async (orders) => {
  const ids = orders.map((o) => o._id);
  const shipments = await Shipment.find({ order: { $in: ids } }).lean();
  return new Map(shipments.map((s) => [String(s.order), s]));
};

// --- Bosta webhook parsing + dispatch ---

/** Flat Bosta dashboard webhook body or nested delivery payloads. */
export const parseWebhookDelivery = (body) => {
  const raw = body?.delivery ?? body?.data ?? body ?? {};
  const delivery = raw?.delivery ?? raw;

  const state = delivery.state ?? delivery.State ?? body?.state ?? body?.State ?? null;

  return {
    deliveryId: delivery._id ?? delivery.id ?? delivery.deliveryId ?? body?._id ?? body?.deliveryId ?? null,
    trackingNumber: delivery.trackingNumber ?? delivery.tracking_number ?? body?.trackingNumber ?? null,
    state,
    type: delivery.type ?? body?.type ?? null,
    businessReference:
      delivery.businessReference ?? delivery.business_reference ?? body?.businessReference ?? null,
    cod: delivery.cod ?? body?.cod ?? null,
    timeStamp: delivery.timeStamp ?? delivery.timestamp ?? body?.timeStamp ?? null,
    isConfirmedDelivery: delivery.isConfirmedDelivery ?? body?.isConfirmedDelivery ?? null,
    exceptionReason: delivery.exceptionReason ?? body?.exceptionReason ?? null,
    exceptionCode: delivery.exceptionCode ?? body?.exceptionCode ?? null,
    numberOfAttempts: delivery.numberOfAttempts ?? body?.numberOfAttempts ?? null,
  };
};

/** Dispatch a Bosta webhook to return or outbound shipment handlers. */
export const handleBostaWebhookPayload = async (body) => {
  const parsed = parseWebhookDelivery(body);
  if (parsed.state == null && !parsed.trackingNumber && !parsed.deliveryId) {
    return { handled: false, reason: 'missing_state' };
  }

  // Lazy import avoids a hard circular-import edge at module-eval time; return.controller.js
  // owns Bosta-return logistics and the refundStatus transition rules.
  const { handleBostaReturnWebhook } = await import('./return.controller.js');
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

// --- carrier assignment orchestration ---

/** True when a shipment already has a committed carrier assignment. */
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

/** Clear carrier/tracking fields on a shipment (rollback helper). */
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

/** Stamp carrier assignment fields onto a shipment from admin options. */
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

/** Generate a unique manual tracking number for known/internal carriers. */
const generateManualTrackingNumber = async (order, carrier) => {
  const code =
    String(carrier?.code || 'OX')
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .slice(0, 6) || 'OX';
  const suffix = String(order._id).slice(-10).toUpperCase();
  let candidate = `OX-${code}-${suffix}`;
  let attempt = 0;

  while (attempt < 8) {
    const exists = await Shipment.exists({ trackingNumber: candidate });
    if (!exists) return candidate;
    attempt += 1;
    candidate = `OX-${code}-${suffix}-${attempt}`;
  }

  return `OX-${code}-${Date.now().toString(36).toUpperCase()}`;
};

/**
 * Order + carrier assignment workflow — includes rollback-on-failure, so try/catch here is intentional.
 * Assign is allowed from pending/confirmed/processing and advances straight to processing/shipped
 * (no separate confirm step required).
 */
const assignOrderToCarrier = async (order, carrier, adminUserId, options = {}) => {
  if (BLOCKED_ASSIGN_ORDER_STATUSES.has(order.orderStatus)) {
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
      // Compensating action: roll back the half-applied shipment state on Bosta API failure.
      const bostaMsg = formatBostaError(err);
      clearShipmentCarrier(shipment);
      shipment.lastError = bostaMsg;
      shipment.attemptCount = (shipment.attemptCount || 0) + 1;
      shipment.status = 'pending_assignment';
      await shipment.save();
      if (err instanceof ApiError) throw err;
      if (isUncoveredAddressError(err) || err.statusCode === 400) {
        throw new ApiError(bostaMsg, 400);
      }
      throw new ApiError(bostaMsg, err.statusCode || 502);
    }

    orderStatus = mapBostaStateToOrderStatus(shipment.providerState, 'processing') ?? 'processing';
  } else if (carrier.type === 'known' || carrier.type === 'internal') {
    applyShipmentCarrier(shipment, carrier, adminUserId, options);
    if (!shipment.trackingNumber) {
      shipment.trackingNumber = await generateManualTrackingNumber(order, carrier);
    }
    shipment.status = options.markShipped === false ? 'pending_assignment' : 'submitted';
    appendShipmentEvent(shipment, { code: 'submitted', label: 'Shipment registered', source: 'admin' });
    orderStatus = options.markShipped !== true ? 'processing' : 'shipped';
  } else {
    throw new ApiError(`Carrier type ${carrier.type} is not supported for assignment`, 400);
  }

  await shipment.save();
  order.orderStatus = orderStatus;
  await order.save();
  await syncOrderFromShipment(shipment);

  return order;
};

/** Rematch order.shippingAddress zone refs after a zone wipe+resync (single-owner wrapper). */
const healOrderShippingAddress = async (order, { save = true, soft = false } = {}) => {
  if (!order?.shippingAddress) return { healed: false, order };

  const sa = order.shippingAddress;
  // Lazy import avoids a hard circular-import edge at module-eval time; order.controller.js owns the resolver.
  const { resolveZoneRefs } = await import('./order.controller.js');
  const resolved = await resolveZoneRefs(
    {
      governorateId: sa.governorateId,
      districtId: sa.districtId,
      countryId: sa.countryId,
      governorateName: sa.governorateName,
      districtName: sa.districtName,
      countryName: sa.countryName,
      isOther: sa.isOther,
    },
    { soft: true }
  );

  if (!resolved.ok || resolved.unresolved) {
    if (soft) return { healed: false, unresolved: true, order };
    throw new ApiError(
      `Order shipping zone could not be rematched (${sa.governorateName} / ${sa.districtName})`,
      400
    );
  }

  if (!resolved.healed) return { healed: false, unresolved: false, order };

  sa.countryId = resolved.countryId;
  sa.governorateId = resolved.governorateId;
  sa.districtId = resolved.districtId;
  sa.isOther = resolved.isOther;
  if (resolved.governorateName) sa.governorateName = resolved.governorateName;
  if (resolved.districtName) sa.districtName = resolved.districtName;

  if (save && typeof order.save === 'function') await order.save();
  return { healed: true, unresolved: false, order };
};

// --- route handlers ---

/**
 * @desc    Order detail + assignable carriers for shipping admin
 * @route   GET /api/v1/admin/shipping/orders/:id
 * @access  Admin
 */
export const getOrderShippingDetail = asyncHandler(async (req, res, next) => {
  const order = await Order.findById(req.params.id).populate('user', 'name email phone');
  if (!order) return next(new ApiError(`No order found with id: ${req.params.id}`, 404));

  await healOrderShippingAddress(order, { save: true, soft: true });

  const shipment = await Shipment.findOne({ order: order._id }).lean();

  const coverages = await CarrierCoverage.find({
    governorate: order.shippingAddress.governorateId,
    isActive: true,
  }).select('carrier');

  const coveredIds = coverages.map((c) => c.carrier);
  const enabledTypes = await ShippingMethodSetting.getEnabledTypes();
  const carriers = await Carrier.find({
    isActive: true,
    type: { $in: [...enabledTypes] },
  })
    .select('name code type apiProvider isActive')
    .sort({ type: 1, name: 1 })
    .lean();

  let zoneMapping = null;
  let districtMeta = null;
  if (order.shippingAddress.districtId) {
    districtMeta = await District.findById(order.shippingAddress.districtId)
      .select('name isCovered bostaCovered')
      .lean();
    zoneMapping = await CarrierZoneMapping.findOne({
      zoneType: 'district',
      zoneId: order.shippingAddress.districtId,
      isServiceable: true,
    })
      .populate('carrier', 'name code')
      .lean();
  }

  const bostaCarrierIds = carriers
    .filter((c) => c.type === 'api' && c.apiProvider === 'bosta')
    .map((c) => c._id);

  const pickupDocs = bostaCarrierIds.length
    ? await CarrierPickup.find({ carrier: { $in: bostaCarrierIds } })
        .select('carrier locationName bostaLocationId isDefault address.city address.districtName')
        .sort({ isDefault: -1, locationName: 1 })
        .limit(200)
        .lean()
    : [];

  const pickupsByCarrier = {};
  for (const p of pickupDocs) {
    const key = p.carrier.toString();
    if (!pickupsByCarrier[key]) pickupsByCarrier[key] = [];
    pickupsByCarrier[key].push({
      _id: p._id,
      locationName: p.locationName,
      isDefault: p.isDefault,
      bostaLocationId: p.bostaLocationId,
      city: p.address?.city,
      districtName: p.address?.districtName,
    });
  }

  // Lazy import avoids a hard circular-import edge at module-eval time; order.controller.js owns presentation.
  const { enrichOrderDocument } = await import('./order.controller.js');
  const data = {
    order: enrichOrderDocument(order, shipment),
    shipment,
    zoneMapping,
    districtMeta: districtMeta ? toPlainDoc(districtMeta) : null,
    pickupsByCarrier,
    carriers: carriers.map((c) => {
      const cid = c._id.toString();
      const pickupCount = c.type === 'api' && c.apiProvider === 'bosta' ? (pickupsByCarrier[cid]?.length ?? 0) : 0;
      return {
        ...toPlainDoc(c),
        coversGovernorate: coveredIds.some((id) => id.toString() === c._id.toString()),
        pickupCount,
        hasPickups: c.type !== 'api' || c.apiProvider !== 'bosta' || pickupCount > 0,
      };
    }),
  };

  sendResponse(res, { message: 'Order shipping detail retrieved successfully', data });
});

/**
 * @desc    Update order + shipment status for manual (known/internal) carriers
 * @route   PATCH /api/v1/admin/shipping/orders/:id/status
 * @access  Admin
 */
export const updateManualOrderShippingStatus = asyncHandler(async (req, res, next) => {
  const order = await Order.findById(req.params.id);
  if (!order) return next(new ApiError(`No order found with id: ${req.params.id}`, 404));

  const shipment = await Shipment.findOne({ order: order._id });
  if (!shipment) return next(new ApiError('No shipment found for this order', 404));
  if (!MANUAL_CARRIER_TYPES.has(shipment.carrierType)) {
    return next(
      new ApiError('Manual status updates are only allowed for known or internal carriers', 400)
    );
  }
  if (!isCommittedCarrierAssignment(shipment)) {
    return next(new ApiError('Assign a manual carrier before updating shipment status', 400));
  }

  const nextStatus = req.body.orderStatus;
  if (!MANUAL_ORDER_STATUSES.includes(nextStatus)) {
    return next(new ApiError(`Invalid manual order status: ${nextStatus}`, 400));
  }

  const shipmentStatus = ORDER_TO_SHIPMENT_STATUS[nextStatus];
  const label = MANUAL_STATUS_LABELS[nextStatus] || nextStatus;

  order.orderStatus = nextStatus;
  if (nextStatus === 'delivered' && !order.deliveredAt) {
    order.deliveredAt = new Date();
    if (order.paymentMethod === 'cod' && order.paymentStatus === 'pending') {
      order.paymentStatus = 'paid';
      order.codCollectedAt = new Date();
    }
  }
  if (nextStatus === 'cancelled' && !order.cancelledAt) {
    order.cancelledAt = new Date();
    order.cancelledBy = 'admin';
    order.cancellationReason = req.body.notes?.trim() || order.cancellationReason || 'Cancelled by admin';
  }

  if (shipmentStatus) shipment.status = shipmentStatus;
  shipment.providerStateLabel = label;
  if (req.body.notes?.trim()) shipment.notes = req.body.notes.trim();
  appendShipmentEvent(shipment, {
    code: nextStatus,
    label,
    source: 'admin',
  });

  await shipment.save();
  await order.save();

  const { enrichOrderDocument } = await import('./order.controller.js');
  sendResponse(res, {
    message: 'Manual shipment status updated successfully',
    data: enrichOrderDocument(order, shipment),
  });
});

/**
 * @desc    Assign carrier to order (Bosta API or manual known/internal)
 * @route   POST /api/v1/admin/shipping/orders/:id/assign
 * @access  Admin
 */
export const assignOrderShipping = asyncHandler(async (req, res, next) => {
  const order = await Order.findById(req.params.id);
  if (!order) return next(new ApiError(`No order found with id: ${req.params.id}`, 404));

  await healOrderShippingAddress(order, { save: true, soft: false });

  const carrier = await Carrier.findById(req.body.carrierId);
  if (!carrier) return next(new ApiError(`No carrier found with id: ${req.body.carrierId}`, 404));
  if (!carrier.isActive) return next(new ApiError('Carrier is not active', 400));

  const typeEnabled = await ShippingMethodSetting.isTypeEnabled(carrier.type);
  if (!typeEnabled) {
    return next(
      new ApiError(
        `Shipping method type "${carrier.type}" is disabled. Enable it in Shipping Methods first.`,
        400
      )
    );
  }

  const updated = await assignOrderToCarrier(order, carrier, req.user._id, {
    driverName: req.body.driverName,
    driverPhone: req.body.driverPhone,
    trackingNumber: req.body.trackingNumber,
    notes: req.body.notes,
    markShipped: req.body.markShipped,
    size: req.body.size,
    pickupId: req.body.pickupId,
    allowToOpenPackage: req.body.allowToOpenPackage,
  });

  const shipment = await Shipment.findOne({ order: updated._id }).lean();
  const { enrichOrderDocument } = await import('./order.controller.js');
  sendResponse(res, {
    message: 'Carrier assigned to order successfully',
    data: enrichOrderDocument(updated, shipment),
  });
});
