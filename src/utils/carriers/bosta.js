// src/utils/carriers/bosta.js

const splitReceiverName = (receiverName) => {
  const parts = (receiverName || "").trim().split(/\s+/).filter(Boolean);
  const firstName = parts[0] || "Customer";
  const lastName = parts.slice(1).join(" ") || firstName;
  return { firstName, lastName };
};

export const bostaRequest = async (
  method,
  path,
  body,
  { apiKey, apiBaseUrl },
) => {
  const base = apiBaseUrl.replace(/\/$/, "");
  const token = apiKey?.trim();
  const options = {
    method,
    headers: {
      // Bosta expects the raw API key — not "Bearer <key>"
      Authorization: token,
      "Content-Type": "application/json",
    },
  };

  if (body !== undefined && body !== null) {
    options.body = JSON.stringify(body);
  }

  const res = await fetch(`${base}${path}`, options);
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const err = new Error(
      data?.message ||
        data?.error ||
        data?.errorMessage ||
        "Bosta request failed",
    );
    err.statusCode = res.status;
    err.bostaError = data;
    throw err;
  }

  return data;
};

export const buildBostaAddress = ({
  city,
  zone,
  districtId,
  firstLine,
  secondLine,
} = {}) => {
  const addr = {
    city: String(city || "").trim(),
    zone: String(zone || city || "").trim(),
    firstLine: String(firstLine || "").trim(),
  };
  if (districtId) addr.districtId = String(districtId).trim();
  if (secondLine) addr.secondLine = String(secondLine).trim();
  return addr;
};

const pickupFromEnv = () => {
  const city = process.env.BOSTA_PICKUP_CITY?.trim();
  const firstLine = process.env.BOSTA_PICKUP_FIRST_LINE?.trim();
  if (!city || !firstLine) return null;
  return buildBostaAddress({
    city,
    zone: process.env.BOSTA_PICKUP_ZONE?.trim() || city,
    // district Id: process.env.BOSTA_PICKUP_DISTRICT_ID?.trim(),
    districtName: "Mohandesiin El Sadiq", // ← ضيف ده
    firstLine,
    secondLine: process.env.BOSTA_PICKUP_SECOND_LINE?.trim(),
  });
};

const normalizePickupLocation = (loc) => {
  const addr = loc?.address ?? loc;
  if (!addr?.city || !(addr.firstLine || addr.first_line)) return null;
  return buildBostaAddress({
    city: addr.city,
    zone: addr.zone ?? addr.zoneName ?? addr.city,
    districtId: addr.districtId ?? addr.district?._id,
    firstLine: addr.firstLine ?? addr.first_line,
    secondLine: addr.secondLine,
  });
};

export const fetchBostaPickupAddress = async (credentials) => {
  const paths = [
    "/api/v2/pickup-locations",
    "/api/v2/pickups/locations",
    "/api/v2/businesses/pickup-locations",
  ];

  for (const path of paths) {
    try {
      const res = await bostaRequest("GET", path, null, credentials);
      const list =
        res.data?.pickupLocations ??
        res.data?.locations ??
        res.pickupLocations ??
        (Array.isArray(res.data) ? res.data : null);
      const loc = Array.isArray(list) ? list[0] : res.data;
      const normalized = normalizePickupLocation(loc);
      if (normalized) return normalized;
    } catch {
      // try next endpoint shape
    }
  }
  return null;
};

export const resolveBostaPickupAddress = async (credentials) => {
  const fromEnv = pickupFromEnv();
  if (fromEnv) return fromEnv;

  const fromApi = await fetchBostaPickupAddress(credentials);
  if (fromApi) return fromApi;

  const err = new Error(
    "Bosta pickup address is not configured. Add a pickup location in the Bosta dashboard or set BOSTA_PICKUP_CITY and BOSTA_PICKUP_FIRST_LINE in .env",
  );
  err.statusCode = 400;
  throw err;
};

export const buildBostaSpecs = ({
  packageType = "Parcel",
  size = "MEDIUM",
  itemsCount = 1,
  description = "Shipment",
} = {}) => ({
  packageType,
  size,
  packageDetails: {
    itemsCount: Math.max(1, Number(itemsCount) || 1),
    description:
      String(description || "Shipment")
        .trim()
        .slice(0, 500) || "Shipment",
  },
});

export const createBostaDelivery = async (params, credentials) => {
  const { firstName, lastName } = splitReceiverName(params.receiverName);
  const specs = buildBostaSpecs(params.packageSpecs);
  const pickupAddress =
    params.pickupAddress ?? (await resolveBostaPickupAddress(credentials));

  return bostaRequest(
    "POST",
    "/api/v2/deliveries?apiVersion=1",
    {
      type: 10,
      specs,
      receiver: {
        firstName,
        lastName,
        phone: params.receiverPhone,
      },
      dropOffAddress: params.dropOffAddress,
      pickupAddress,
      cod: params.cod,
      businessReference: params.businessReference,
      notes: params.notes ?? "",
    },
    credentials,
  );
};

export const trackBostaDelivery = async (trackingNumber, credentials) =>
  bostaRequest(
    "GET",
    `/api/v2/deliveries/tracking/${trackingNumber}`,
    null,
    credentials,
  );

export const cancelBostaDelivery = async (deliveryId, credentials) =>
  bostaRequest("DELETE", `/api/v2/deliveries/${deliveryId}`, null, credentials);
