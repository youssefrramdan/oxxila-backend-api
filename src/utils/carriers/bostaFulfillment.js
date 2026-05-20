// src/utils/carriers/bostaFulfillment.js
import Order from '../../models/Order.js';
import ReturnRequest from '../../models/ReturnRequest.js';
import Carrier from '../../models/Carrier.js';
import CarrierPickup from '../../models/CarrierPickup.js';
import District from '../../models/District.js';
import Governorate from '../../models/Governorate.js';
import User from '../../models/User.js';
import Country from '../../models/Country.js';
import CarrierCoverage from '../../models/CarrierCoverage.js';
import ApiError from '../apiError.js';
import {
  bostaRequest,
  buildBostaSpecs,
  enrichBostaAddress,
  splitBostaContactName,
  trackBostaDelivery,
  getBostaCredentials,
  fetchBostaCityDistricts,
} from './bosta.js';

/** Bosta carrier state codes → order/return status. */
const ORDER_STATUS_RANK = {
  pending: 1,
  confirmed: 2,
  processing: 3,
  shipped: 4,
  delivered: 5,
  partially_returned: 5,
  returned: 5,
  cancelled: 0,
};

const RETURN_STATUS_RANK = {
  pending: 1,
  approved: 2,
  picked_up: 3,
  received: 4,
  refunded: 5,
  rejected: 0,
};

export const normalizeBostaState = (state) => {
  if (state == null) return null;
  if (typeof state === "object") {
    const v = state.value ?? state.name ?? state.code;
    if (v != null) return normalizeBostaState(v);
    return null;
  }
  const s = String(state).trim();
  if (!s) return null;
  if (/^\d+$/.test(s)) return s;
  return s.replace(/\s+/g, "_").toUpperCase();
};

/** Bosta pickup-phase states (codes ~10–29 and common string names). */
const BOSTA_PICKUP_STATES = new Set([
  "10",
  "11",
  "12",
  "20",
  "21",
  "22",
  "23",
  "24",
  "NEW",
  "POSTED",
  "PICKUP_REQUESTED",
  "WAITING_FOR_ROUTE",
  "ROUTE_ASSIGNED",
  "PICKED_UP",
  "RECEIVED_AT_WAREHOUSE",
  "PICKED_UP_FROM_BUSINESS",
  "RECEIVED_BY_MIDDLE_MILE",
]);

/** Bosta in-transit states (codes ~30–39). */
const BOSTA_TRANSIT_STATES = new Set([
  "30",
  "31",
  "32",
  "33",
  "34",
  "35",
  "36",
  "37",
  "38",
  "39",
  "IN_TRANSIT",
  "IN_TRANSIT_TO_DESTINATION",
  "OUT_FOR_DELIVERY",
  "OUT_FOR_DELIVER",
  "ASSIGNED_TO_ROUTE",
]);

/** Bosta delivered / completed forward delivery (codes ~40–45). */
const BOSTA_DELIVERED_STATES = new Set([
  "40",
  "41",
  "42",
  "43",
  "44",
  "45",
  "DELIVERED",
  "DELIVERED_TO_CUSTOMER",
  "DELIVERED_TO_SENDER",
]);

const BOSTA_CANCELLED_STATES = new Set([
  "CANCELLED",
  "CANCELED",
  "TERMINATED",
  "LOST",
  "DAMAGED",
  "RETURNED_TO_BUSINESS",
  "RETURNED_TO_SENDER",
]);

/**
 * UI tracker step from Bosta state (forward delivery or customer return pickup).
 */
export const mapBostaStateToTrackingStep = (bostaState) => {
  const s = normalizeBostaState(bostaState);
  if (!s) return null;
  if (BOSTA_DELIVERED_STATES.has(s)) return "delivery";
  if (BOSTA_TRANSIT_STATES.has(s)) return "shipping";
  if (BOSTA_PICKUP_STATES.has(s)) {
    if (["NEW", "POSTED", "10", "11", "12", "PICKUP_REQUESTED"].includes(s)) {
      return "pending";
    }
    return "processing";
  }
  return null;
};

/**
 * Internal orderStatus stored in Mongo — aligned with tracker + Bosta lifecycle.
 */
export const mapBostaStateToOrderStatus = (bostaState, currentStatus = "pending") => {
  const s = normalizeBostaState(bostaState);
  if (!s || BOSTA_CANCELLED_STATES.has(s)) return null;

  let next = currentStatus;
  if (BOSTA_DELIVERED_STATES.has(s)) next = "delivered";
  else if (BOSTA_TRANSIT_STATES.has(s)) next = "shipped";
  else if (BOSTA_PICKUP_STATES.has(s)) {
    if (["NEW", "POSTED", "10", "11", "12", "PICKUP_REQUESTED"].includes(s)) {
      next = ORDER_STATUS_RANK[currentStatus] >= ORDER_STATUS_RANK.confirmed
        ? currentStatus
        : "pending";
    } else {
      next = "processing";
    }
  } else {
    return null;
  }

  const curRank = ORDER_STATUS_RANK[next] ?? 0;
  const prevRank = ORDER_STATUS_RANK[currentStatus] ?? 0;
  if (curRank < prevRank) return null;
  return next;
};

/**
 * Return refundStatus from Bosta Customer Return Pickup state (forward-only).
 */
export const mapBostaStateToReturnStatus = (bostaState, currentStatus = "approved") => {
  const s = normalizeBostaState(bostaState);
  if (!s || BOSTA_CANCELLED_STATES.has(s)) return null;
  if (["rejected", "refunded"].includes(currentStatus)) return null;

  let next = currentStatus;
  if (BOSTA_DELIVERED_STATES.has(s) || s === "RECEIVED_AT_WAREHOUSE") {
    next = "received";
  } else if (BOSTA_TRANSIT_STATES.has(s) || s === "PICKED_UP") {
    next = "picked_up";
  } else if (BOSTA_PICKUP_STATES.has(s)) {
    next = "approved";
  } else {
    return null;
  }

  const curRank = RETURN_STATUS_RANK[next] ?? 0;
  const prevRank = RETURN_STATUS_RANK[currentStatus] ?? 0;
  if (curRank <= prevRank) return null;
  return next;
};

export const pickHigherOrderStatus = (current, next) => {
  if (!next) return current;
  const a = ORDER_STATUS_RANK[current] ?? 0;
  const b = ORDER_STATUS_RANK[next] ?? 0;
  return b >= a ? next : current;
};


const normalizeLabel = (value) =>
  String(value || "")
    .trim()
    .toLowerCase();

const matchGovernorate = (governorates, city) => {
  const needles = [city.cityName, city.cityOtherName, city.cityCode]
    .map(normalizeLabel)
    .filter(Boolean);

  return governorates.find((g) => {
    const name = normalizeLabel(g.name);
    return needles.some(
      (n) =>
        n.length > 2 && (n === name || name.includes(n) || n.includes(name)),
    );
  });
};

const matchDistrict = (districts, bostaDistrict) => {
  const needles = [
    bostaDistrict.districtName,
    bostaDistrict.districtOtherName,
    bostaDistrict.zoneName,
    bostaDistrict.zoneOtherName,
  ]
    .map(normalizeLabel)
    .filter(Boolean);

  return districts.find((d) => {
    const name = normalizeLabel(d.name);
    return needles.some(
      (n) =>
        n.length > 2 && (n === name || name.includes(n) || n.includes(name)),
    );
  });
};

export const syncBostaZones = async (
  credentials,
  { countryCode = "EG" } = {},
) => {
  const cities = await fetchBostaCityDistricts(credentials);
  const country = await Country.findOne({
    code: countryCode.toUpperCase(),
    isActive: true,
  });
  if (!country) {
    throw new Error(`No active country found with code: ${countryCode}`);
  }

  let governoratesMatched = 0;
  let districtsCreated = 0;
  let districtsUpdated = 0;
  let governoratesCreated = 0;

  const existingGovs = await Governorate.find({ country: country._id });

  for (const city of cities) {
    if (city.dropOffAvailability === false) continue;

    let governorate = matchGovernorate(existingGovs, city);
    if (!governorate) {
      governorate = await Governorate.create({
        country: country._id,
        name: city.cityName || city.cityOtherName || city.cityCode,
        shippingPrice: 0,
        isActive: true,
        bostaApiCovered: true,
        bostaCityId: city.cityId,
      });
      existingGovs.push(governorate);
      governoratesCreated += 1;
    } else {
      await Governorate.findByIdAndUpdate(governorate._id, {
        bostaApiCovered: true,
        bostaCityId: city.cityId,
      });
      governoratesMatched += 1;
    }

    const existingDistricts = await District.find({
      governorate: governorate._id,
    });
    const bostaDistricts = city.districts || [];

    const ops = [];
    for (const bd of bostaDistricts) {
      if (bd.dropOffAvailability === false) continue;

      const matched = matchDistrict(existingDistricts, bd);
      if (matched) {
        ops.push({
          updateOne: {
            filter: { _id: matched._id },
            update: {
              $set: {
                bostaApiCovered: true,
                bostaDistrictId: bd.districtId,
                bostaZoneId: bd.zoneId ?? null,
                bostaDropOffAvailable: bd.dropOffAvailability !== false,
                isCovered: true,
              },
            },
          },
        });
        districtsUpdated += 1;
      } else {
        ops.push({
          insertOne: {
            document: {
              governorate: governorate._id,
              name: bd.districtName || bd.zoneName || "District",
              shippingPrice: governorate.shippingPrice ?? 0,
              isCovered: true,
              bostaApiCovered: true,
              bostaDistrictId: bd.districtId,
              bostaZoneId: bd.zoneId ?? null,
              bostaDropOffAvailable: bd.dropOffAvailability !== false,
            },
          },
        });
        districtsCreated += 1;
      }
    }

    if (ops.length) await District.bulkWrite(ops);
  }

  return {
    governoratesMatched,
    governoratesCreated,
    districtsCreated,
    districtsUpdated,
    citiesProcessed: cities.length,
  };
};

export const syncBostaCarrierCoverage = async (carrierId, credentials) => {
  await syncBostaZones(credentials);

  const country = await Country.findOne({ code: "EG", isActive: true });
  if (!country) return { count: 0 };

  const governorates = await Governorate.find({
    country: country._id,
    bostaApiCovered: true,
    isActive: true,
  });

  const coveredGovIds = [];
  for (const gov of governorates) {
    const hasDropOff = await District.exists({
      governorate: gov._id,
      bostaApiCovered: true,
      bostaDropOffAvailable: { $ne: false },
    });
    if (hasDropOff) coveredGovIds.push(gov._id);
  }

  await CarrierCoverage.deleteMany({ carrier: carrierId });
  if (coveredGovIds.length > 0) {
    await CarrierCoverage.insertMany(
      coveredGovIds.map((governorate) => ({
        carrier: carrierId,
        governorate,
        isActive: true,
      })),
    );
  }

  return { count: coveredGovIds.length };
};


const parseWebhookDelivery = (body) => {
  const raw = body?.delivery ?? body?.data ?? body ?? {};
  const delivery = raw?.delivery ?? raw;

  return {
    deliveryId:
      delivery._id ??
      delivery.id ??
      delivery.deliveryId ??
      body?.deliveryId ??
      null,
    trackingNumber:
      delivery.trackingNumber ??
      delivery.tracking_number ??
      body?.trackingNumber ??
      null,
    state:
      delivery.state ??
      delivery.State ??
      body?.state ??
      body?.State ??
      null,
    businessReference:
      delivery.businessReference ??
      delivery.business_reference ??
      body?.businessReference ??
      null,
    type: delivery.type?.value ?? delivery.type ?? body?.type ?? null,
  };
};

export const applyBostaStateToOrder = async (order, bostaState) => {
  const normalized = normalizeBostaState(bostaState);
  if (!normalized) return order;

  const mapped = mapBostaStateToOrderStatus(normalized, order.orderStatus);
  const nextStatus = pickHigherOrderStatus(order.orderStatus, mapped);

  const updates = {
    "fulfillment.bostaState": normalized,
  };
  if (nextStatus && nextStatus !== order.orderStatus) {
    updates.orderStatus = nextStatus;
    if (nextStatus === "delivered" && !order.deliveredAt) {
      updates.deliveredAt = new Date();
    }
  }

  return Order.findByIdAndUpdate(
    order._id,
    { $set: updates },
    { new: true, runValidators: true },
  );
};

export const applyBostaStateToReturn = async (returnRequest, bostaState) => {
  const normalized = normalizeBostaState(bostaState);
  if (!normalized) return returnRequest;

  const mapped = mapBostaStateToReturnStatus(
    normalized,
    returnRequest.refundStatus,
  );

  const updates = { bostaReturnState: normalized };
  if (mapped && mapped !== returnRequest.refundStatus) {
    updates.refundStatus = mapped;
  }

  return ReturnRequest.findByIdAndUpdate(
    returnRequest._id,
    { $set: updates },
    { new: true, runValidators: true },
  );
};

const findOrderForWebhook = async ({ deliveryId, trackingNumber, businessReference }) => {
  if (businessReference) {
    const byRef = await Order.findById(businessReference);
    if (byRef) return byRef;
  }
  if (deliveryId) {
    const byId = await Order.findOne({
      "fulfillment.externalDeliveryId": String(deliveryId),
    });
    if (byId) return byId;
  }
  if (trackingNumber) {
    return Order.findOne({
      "fulfillment.trackingNumber": String(trackingNumber),
    });
  }
  return null;
};

const findReturnForWebhook = async ({ deliveryId, trackingNumber, businessReference }) => {
  if (businessReference) {
    const byRef = await ReturnRequest.findById(businessReference);
    if (byRef) return byRef;
  }
  if (deliveryId) {
    const byId = await ReturnRequest.findOne({
      bostaReturnDeliveryId: String(deliveryId),
    });
    if (byId) return byId;
  }
  if (trackingNumber) {
    return ReturnRequest.findOne({
      bostaReturnTrackingNumber: String(trackingNumber),
    });
  }
  return null;
};

/**
 * Handle Bosta webhook payload (forward delivery or customer return pickup).
 */
export const handleBostaWebhookPayload = async (body) => {
  const parsed = parseWebhookDelivery(body);
  if (!parsed.state && !parsed.trackingNumber && !parsed.deliveryId) {
    return { handled: false, reason: "missing_state" };
  }

  const typeStr = String(parsed.type ?? "").toUpperCase();
  const isReturnPickup =
    typeStr.includes("30") ||
    typeStr.includes("RETURN") ||
    typeStr.includes("CUSTOMER_RETURN");

  if (isReturnPickup) {
    const returnRequest = await findReturnForWebhook(parsed);
    if (!returnRequest) return { handled: false, reason: "return_not_found" };
    const updated = await applyBostaStateToReturn(returnRequest, parsed.state);
    return { handled: true, kind: "return", returnRequest: updated };
  }

  const order = await findOrderForWebhook(parsed);
  if (!order) {
    const returnFallback = await findReturnForWebhook(parsed);
    if (returnFallback) {
      const updated = await applyBostaStateToReturn(returnFallback, parsed.state);
      return { handled: true, kind: "return", returnRequest: updated };
    }
    return { handled: false, reason: "order_not_found" };
  }

  const updated = await applyBostaStateToOrder(order, parsed.state);
  return { handled: true, kind: "order", order: updated };
};

export const syncOrderTrackingFromBosta = async (order) => {
  const trackingNumber = order?.fulfillment?.trackingNumber;
  const carrierId = order?.fulfillment?.carrier;
  if (!trackingNumber || !carrierId) return order;

  const carrier = await Carrier.findById(carrierId);
  if (carrier?.apiProvider !== "bosta") return order;

  const credentials = await getBostaCredentials(carrier);
  if (!credentials?.apiKey) return order;

  const res = await trackBostaDelivery(trackingNumber, credentials);
  const delivery = res?.data ?? res;
  const state = delivery?.state ?? delivery?.State;
  return applyBostaStateToOrder(order, state);
};

export const syncReturnTrackingFromBosta = async (returnRequest) => {
  const trackingNumber = returnRequest?.bostaReturnTrackingNumber;
  if (!trackingNumber) return returnRequest;

  const order = await Order.findById(returnRequest.order).select("fulfillment.carrier");
  const carrier = await Carrier.findById(order?.fulfillment?.carrier);
  if (carrier?.apiProvider !== "bosta") return returnRequest;

  const credentials = await getBostaCredentials(carrier);
  if (!credentials?.apiKey) return returnRequest;

  const res = await trackBostaDelivery(trackingNumber, credentials);
  const delivery = res?.data ?? res;
  const state = delivery?.state ?? delivery?.State;
  return applyBostaStateToReturn(returnRequest, state);
};


/** Bosta delivery type: Customer Return Pickup (reverse pickup from customer). */
export const BOSTA_TYPE_CUSTOMER_RETURN_PICKUP = 30;

const BOSTA_PACKAGE_SIZES = new Set([
  "SMALL",
  "MEDIUM",
  "LARGE",
  "Light Bulky",
  "Heavy Bulky",
  "XLARGE",
]);

const formatBostaAddressSummary = (addr) => {
  if (!addr || typeof addr !== "object") return "";
  const city =
    typeof addr.city === "object" ? addr.city?.name : addr.city || "";
  const zone =
    typeof addr.zone === "object"
      ? addr.zone?.name
      : addr.zone || addr.district || "";
  return [addr.firstLine, addr.secondLine, zone, city]
    .map((p) => String(p || "").trim())
    .filter(Boolean)
    .join(", ");
};

/** Bosta UI shows dashes when floor/apartment/building are omitted. */
export const applyBostaAddressDefaults = (addr = {}) => {
  const out = { ...addr };
  const zoneLabel = String(out.zone || out.districtName || "").trim();
  if (!out.secondLine && zoneLabel) out.secondLine = zoneLabel;
  if (!out.floor) out.floor = "1";
  if (!out.apartment) out.apartment = "1";
  if (!out.buildingNumber) out.buildingNumber = "1";
  return out;
};

export const normalizeEgyptPhone = (phone) => {
  const raw = String(phone || "").trim();
  if (!raw) return "";
  if (raw.startsWith("+20")) return raw;
  if (raw.startsWith("20") && raw.length >= 12) return `+${raw}`;
  if (raw.startsWith("0")) return `+20${raw.slice(1)}`;
  return raw;
};

export const normalizeBostaReturnDelivery = (apiRes) => {
  const delivery = apiRes?.data ?? apiRes ?? {};
  const receiver = delivery.receiver ?? {};
  const dropOff = delivery.dropOffAddress ?? {};
  const returnAddr = delivery.returnAddress ?? {};

  return {
    deliveryId: delivery._id ?? delivery.id ?? null,
    trackingNumber:
      delivery.trackingNumber ?? delivery.tracking_number ?? null,
    state:
      delivery.state?.value ??
      (typeof delivery.state === "string" ? delivery.state : null),
    stateCode: delivery.state?.code ?? null,
    customerFullName:
      receiver.fullName ||
      [receiver.firstName, receiver.lastName].filter(Boolean).join(" ").trim() ||
      null,
    customerPhone: receiver.phone ?? null,
    customerAddressSummary: formatBostaAddressSummary(dropOff),
    warehouseAddressSummary: formatBostaAddressSummary(returnAddr),
    packageDescription:
      delivery.specs?.packageDetails?.description ?? null,
    returnPackageDescription:
      delivery.returnSpecs?.packageDetails?.description ?? null,
    itemsCount:
      delivery.specs?.packageDetails?.itemsCount ??
      delivery.returnSpecs?.packageDetails?.itemsCount ??
      null,
    bostaType: delivery.type?.value ?? delivery.type ?? null,
  };
};

const buildItemDescription = (returnRequest) => {
  const names = (returnRequest.items ?? [])
    .map((i) => `${i.name} (×${i.quantity})`)
    .join(", ");
  const base = names || `Return ${returnRequest._id}`;
  return base.slice(0, 500);
};

export const enrichReturnCustomerAddress = async (
  returnRequest,
  credentials,
) => {
  const pa = returnRequest.pickupAddress;
  const [govDoc, distDoc] = await Promise.all([
    pa.governorateId
      ? Governorate.findById(pa.governorateId).select("bostaCityId name")
      : null,
    pa.districtId
      ? District.findById(pa.districtId).select("bostaDistrictId name")
      : null,
  ]);

  const enriched = await enrichBostaAddress(
    {
      city: pa.governorate,
      zone: pa.city,
      firstLine: pa.address,
      cityId: govDoc?.bostaCityId || undefined,
      districtId: distDoc?.bostaDistrictId || undefined,
      districtName:
        !distDoc?.bostaDistrictId && pa.city ? pa.city : undefined,
    },
    credentials,
    {
      cityName: pa.governorate,
      districtName: pa.city,
      districtId: distDoc?.bostaDistrictId,
    },
  );

  if (!enriched?.districtId && !enriched?.districtName) {
    throw new ApiError(
      "Could not resolve Bosta district for customer pickup address. Check governorate/district selection.",
      400,
    );
  }

  if (String(enriched.firstLine || "").trim().length < 5) {
    throw new ApiError(
      "Customer pickup street address must be at least 5 characters for Bosta",
      400,
    );
  }

  return applyBostaAddressDefaults(enriched);
};

export const enrichWarehouseReturnAddress = async (pickupDoc, credentials) => {
  const { address } = pickupDoc ?? {};
  if (!address?.firstLine || !address?.city) {
    throw new ApiError("Warehouse pickup location address is incomplete", 400);
  }

  const enriched = await enrichBostaAddress(
    {
      city: address.city,
      cityId: address.cityId || undefined,
      zone: address.districtName || address.city,
      districtId: address.districtId || undefined,
      districtName: address.districtName || undefined,
      firstLine: address.firstLine,
      secondLine: address.secondLine,
    },
    credentials,
    {
      cityName: address.city,
      districtName: address.districtName,
      districtId: address.districtId,
    },
  );

  if (!enriched?.districtId) {
    throw new ApiError(
      `Warehouse "${pickupDoc.locationName}" has no Bosta districtId. Re-save the pickup in shipping admin.`,
      400,
    );
  }

  return applyBostaAddressDefaults(enriched);
};

export const createBostaCustomerReturnPickup = async (params, credentials) => {
  const { firstName, lastName } = splitBostaContactName(params.customerName);
  const specs = buildBostaSpecs(params.packageSpecs);
  const returnSpecs = buildBostaSpecs(params.returnPackageSpecs);

  const body = {
    type: BOSTA_TYPE_CUSTOMER_RETURN_PICKUP,
    specs,
    returnSpecs,
    receiver: {
      firstName,
      lastName,
      phone: params.customerPhone,
    },
    dropOffAddress: params.customerAddress,
    returnAddress: params.warehouseAddress,
    cod: 0,
    businessReference: params.businessReference,
    notes: params.notes ?? "",
    returnNotes: params.returnNotes ?? "",
  };

  if (params.businessLocationId) {
    body.businessLocationId = params.businessLocationId;
  }

  return bostaRequest(
    "POST",
    "/api/v2/deliveries?apiVersion=1",
    body,
    credentials,
  );
};

export const orderUsesBostaApi = async (order) => {
  if (order?.fulfillment?.carrierType !== "api" || !order?.fulfillment?.carrier) {
    return false;
  }
  const carrier = await Carrier.findById(order.fulfillment.carrier).select(
    "apiProvider type",
  );
  return carrier?.type === "api" && carrier?.apiProvider === "bosta";
};

const assertBostaOrderCarrier = async (order) => {
  if (order?.fulfillment?.carrierType !== "api" || !order?.fulfillment?.carrier) {
    throw new ApiError(
      "Bosta return pickup is only available for orders shipped via a Bosta API carrier",
      400,
    );
  }

  const carrier = await Carrier.findById(order.fulfillment.carrier);
  if (!carrier || carrier.apiProvider !== "bosta") {
    throw new ApiError("Order carrier is not Bosta", 400);
  }

  const credentials = await getBostaCredentials(carrier);
  if (!credentials?.apiKey) {
    throw new ApiError("Bosta API key is not configured for this carrier", 400);
  }

  return { carrier, credentials };
};

/**
 * Create Bosta Customer Return Pickup and persist tracking fields on the return request.
 */
export const createReturnBostaPickup = async (
  returnRequest,
  order,
  { pickupLocationId, size = "MEDIUM" },
) => {
  if (returnRequest.returnMethod !== "pickup") {
    throw new ApiError("Return method is not pickup", 400);
  }
  if (returnRequest.bostaReturnDeliveryId) {
    throw new ApiError("Bosta return pickup already exists for this request", 400);
  }
  if (!pickupLocationId) {
    throw new ApiError("pickupLocationId is required", 400);
  }

  const packageSize = BOSTA_PACKAGE_SIZES.has(size) ? size : "MEDIUM";

  const { credentials } = await assertBostaOrderCarrier(order);

  const pickupDoc = await CarrierPickup.findById(pickupLocationId);
  if (!pickupDoc) {
    throw new ApiError("Pickup location not found", 404);
  }

  const customer = await User.findById(returnRequest.user).select(
    "name phone",
  );
  if (!customer?.phone) {
    throw new ApiError("Customer phone is required for Bosta return pickup", 400);
  }

  const [customerAddress, warehouseAddress] = await Promise.all([
    enrichReturnCustomerAddress(returnRequest, credentials),
    enrichWarehouseReturnAddress(pickupDoc, credentials),
  ]);

  const itemsCount = returnRequest.items.reduce(
    (sum, item) => sum + item.quantity,
    0,
  );
  const itemDescription = buildItemDescription(returnRequest);

  const apiRes = await createBostaCustomerReturnPickup(
    {
      customerName: customer.name,
      customerPhone: normalizeEgyptPhone(customer.phone),
      customerAddress,
      warehouseAddress,
      businessLocationId: pickupDoc.bostaLocationId || undefined,
      businessReference: String(returnRequest._id),
      notes: `Return for order ${order._id}. Reason: ${returnRequest.reason}`,
      returnNotes: returnRequest.note?.trim() || "",
      packageSpecs: {
        itemsCount,
        description: itemDescription,
        size: packageSize,
      },
      returnPackageSpecs: {
        itemsCount,
        description: itemDescription,
        size: packageSize,
      },
    },
    credentials,
  );

  const normalized = normalizeBostaReturnDelivery(apiRes);

  returnRequest.bostaReturnDeliveryId = normalized.deliveryId;
  returnRequest.bostaReturnTrackingNumber = normalized.trackingNumber;
  returnRequest.bostaReturnState = normalized.state;
  returnRequest.bostaReturnMeta = {
    customerFullName: normalized.customerFullName || customer.name,
    customerPhone: normalized.customerPhone || normalizeEgyptPhone(customer.phone),
    customerAddressSummary:
      normalized.customerAddressSummary ||
      formatBostaAddressSummary(customerAddress),
    warehouseLocationName: pickupDoc.locationName,
    warehouseAddressSummary:
      normalized.warehouseAddressSummary ||
      formatBostaAddressSummary(warehouseAddress),
    packageDescription: normalized.packageDescription || itemDescription,
    returnPackageDescription:
      normalized.returnPackageDescription || itemDescription,
    itemsCount: normalized.itemsCount ?? itemsCount,
    bostaType: normalized.bostaType || "CUSTOMER_RETURN_PICKUP",
  };

  return { returnRequest, bosta: normalized };
};

