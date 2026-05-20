// src/utils/carriers/bostaReturnPickup.js
import Carrier from "../../models/Carrier.js";
import CarrierPickup from "../../models/CarrierPickup.js";
import District from "../../models/District.js";
import Governorate from "../../models/Governorate.js";
import User from "../../models/User.js";
import ApiError from "../apiError.js";
import { getBostaCredentials } from "./bostaCredentials.js";
import {
  bostaRequest,
  buildBostaSpecs,
  enrichBostaAddress,
  splitBostaContactName,
} from "./bosta.js";

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
