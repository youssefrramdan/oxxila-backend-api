// src/utils/carriers/bosta.js
import { resolveDeliveryPickupAddress } from "./bostaPickup.js";

export const splitBostaContactName = (fullName) => {
  const parts = (fullName || "").trim().split(/\s+/).filter(Boolean);
  const firstName = parts[0] || "Contact";
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

const normalizeLabel = (value) =>
  String(value || "")
    .trim()
    .toLowerCase();

let cityDistrictsCache = { list: null, fetchedAt: 0 };
const CITY_DISTRICTS_CACHE_MS = 5 * 60 * 1000;

const parseCityDistrictList = (res) => {
  const raw =
    res.data?.list ?? res.data?.cities ?? res.data ?? res.cities ?? res;
  return Array.isArray(raw) ? raw : [];
};

export const matchBostaDistrict = (cities, { cityName, districtName }) => {
  const cityNeedle = normalizeLabel(cityName);
  const distNeedle = normalizeLabel(districtName);
  if (!cityNeedle || !distNeedle || distNeedle === "other") return null;

  const city = cities.find(
    (c) =>
      normalizeLabel(c.cityName) === cityNeedle ||
      normalizeLabel(c.cityOtherName) === cityNeedle ||
      normalizeLabel(c.cityCode) === cityNeedle,
  );
  if (!city?.districts?.length) return null;

  const district = city.districts.find(
    (d) =>
      normalizeLabel(d.districtName) === distNeedle ||
      normalizeLabel(d.districtOtherName) === distNeedle ||
      normalizeLabel(d.zoneName) === distNeedle ||
      normalizeLabel(d.zoneOtherName) === distNeedle,
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

export const matchBostaDistrictById = (cities, districtId) => {
  const id = String(districtId || "").trim();
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

export const fetchBostaCityDistricts = async (credentials) => {
  if (
    cityDistrictsCache.list &&
    Date.now() - cityDistrictsCache.fetchedAt < CITY_DISTRICTS_CACHE_MS
  ) {
    return cityDistrictsCache.list;
  }

  const paths = ["/api/v2/cities/getAllDistricts", "/api/v2/cities"];
  for (const path of paths) {
    try {
      const res = await bostaRequest("GET", path, null, credentials);
      const list = parseCityDistrictList(res);
      if (list.length > 0 && list[0]?.districts) {
        cityDistrictsCache = { list, fetchedAt: Date.now() };
        return list;
      }
    } catch (err) {
      if (err.statusCode === 401 || err.statusCode === 403) throw err;
      // otherwise try next endpoint shape
    }
  }
  return [];
};

export const resolveBostaDistrictMatch = async (
  credentials,
  { cityName, districtName, districtId },
) => {
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

export const buildBostaAddress = ({
  city,
  cityId,
  zone,
  districtId,
  districtName,
  firstLine,
  secondLine,
} = {}) => {
  const addr = {
    city: String(city || "").trim(),
    zone: String(zone || city || "").trim(),
    firstLine: String(firstLine || "").trim(),
  };
  const cid = String(cityId || "").trim();
  const distId = String(districtId || "").trim();
  const label = String(districtName || "").trim() || addr.zone;

  if (cid) addr.cityId = cid;
  if (distId) addr.districtId = distId;
  else if (label && cid) addr.districtName = label;

  if (secondLine) addr.secondLine = String(secondLine).trim();
  return addr;
};

export const enrichBostaAddress = async (addr, credentials, hints = {}) => {
  if (!addr) return addr;

  const cityId = String(hints.cityId || addr.cityId || "").trim();
  const districtId = String(hints.districtId || addr.districtId || "").trim();
  let matched = null;

  if (credentials) {
    matched = await resolveBostaDistrictMatch(credentials, {
      cityName: hints.cityName || addr.city,
      districtName: hints.districtName || addr.districtName || addr.zone,
      districtId: hints.districtId || addr.districtId,
    });
  }

  const districtLabel =
    matched?.districtName ||
    hints.districtName ||
    addr.districtName ||
    addr.zone;

  return buildBostaAddress({
    city: matched?.cityName || addr.city,
    cityId: matched?.cityId || cityId || undefined,
    zone: matched?.zoneName || addr.zone,
    districtId: matched?.districtId || districtId || undefined,
    districtName: matched?.districtId || districtId ? undefined : districtLabel,
    firstLine: addr.firstLine,
    secondLine: addr.secondLine,
  });
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
  const { firstName, lastName } = splitBostaContactName(params.receiverName);
  const specs = buildBostaSpecs(params.packageSpecs);
  const pickupAddress =
    params.pickupAddress ??
    (await resolveDeliveryPickupAddress(credentials, {
      pickupDoc: params.defaultPickupFromDb,
    }));

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

// type 25 = Return delivery:
// - pickupAddress = customer address (Bosta picks up from here)
// - dropOffAddress = warehouse address (Bosta delivers to here)
// - receiver = business contact (warehouse)
// - cod always 0 — no cash collected on returns
export const createBostaReturnDelivery = async (params, credentials) => {
  const { firstName, lastName } = splitBostaContactName(
    params.businessContactName,
  );
  const specs = buildBostaSpecs(params.packageSpecs);

  return bostaRequest(
    "POST",
    "/api/v2/deliveries?apiVersion=1",
    {
      type: 25,
      specs,
      receiver: {
        firstName,
        lastName,
        phone: params.businessPhone,
      },
      pickupAddress: params.customerAddress,
      dropOffAddress: params.warehouseAddress,
      cod: 0,
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
