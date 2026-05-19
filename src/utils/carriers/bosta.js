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
    } catch {
      // try next endpoint shape
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

export const lookupBostaDistrict = async (credentials, { cityName, districtName, districtId }) =>
  resolveBostaDistrictMatch(credentials, { cityName, districtName, districtId });

export const addressFromPayload = (payload) => {
  if (!payload?.city?.trim() || !payload?.firstLine?.trim()) return null;
  return buildBostaAddress({
    city: payload.city,
    cityId: payload.cityId,
    zone: payload.zone,
    districtId: payload.districtId,
    districtName: payload.districtName,
    firstLine: payload.firstLine,
    secondLine: payload.secondLine,
  });
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
  const distName = String(districtName || "").trim();
  if (cid) addr.cityId = cid;
  if (distId) {
    addr.districtId = distId;
  } else if (distName) {
    addr.districtName = distName;
  } else if (addr.zone) {
    addr.districtName = addr.zone;
  }
  if (secondLine) addr.secondLine = String(secondLine).trim();
  return addr;
};

export const enrichBostaAddress = async (addr, credentials, hints = {}) => {
  if (!addr || !credentials) return addr;

  const cityId = String(hints.cityId || addr.cityId || "").trim();
  const districtId = String(hints.districtId || addr.districtId || "").trim();
  if (cityId && districtId) return addr;

  const matched = await resolveBostaDistrictMatch(credentials, {
    cityName: hints.cityName || addr.city,
    districtName: hints.districtName || addr.districtName || addr.zone,
    districtId: hints.districtId || addr.districtId,
  });
  if (!matched) return addr;

  return buildBostaAddress({
    city: matched.cityName || addr.city,
    cityId: matched.cityId,
    zone: matched.zoneName || addr.zone,
    districtId: matched.districtId,
    firstLine: addr.firstLine,
    secondLine: addr.secondLine,
  });
};

const pickupFromEnv = () => {
  const city = process.env.BOSTA_PICKUP_CITY?.trim();
  const firstLine = process.env.BOSTA_PICKUP_FIRST_LINE?.trim();
  if (!city || !firstLine) return null;
  return buildBostaAddress({
    city,
    zone: process.env.BOSTA_PICKUP_ZONE?.trim() || city,
    districtId: process.env.BOSTA_PICKUP_DISTRICT_ID?.trim(),
    districtName: process.env.BOSTA_PICKUP_DISTRICT_NAME?.trim(),
    firstLine,
    secondLine: process.env.BOSTA_PICKUP_SECOND_LINE?.trim(),
  });
};

const normalizePickupLocation = (loc) => {
  const addr = loc?.address ?? loc;
  if (!addr?.city || !(addr.firstLine || addr.first_line)) return null;
  return buildBostaAddress({
    city: addr.city,
    cityId: addr.cityId ?? loc?.cityId,
    zone: addr.zone ?? addr.zoneName ?? addr.city,
    districtId: addr.districtId ?? addr.district?._id ?? addr.district?.id,
    districtName: addr.districtName ?? addr.district?.name ?? loc?.districtName,
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

const enrichAddressWithBostaDistrict = async (addr, credentials, hints) =>
  enrichBostaAddress(addr, credentials, hints);

export const resolveBostaPickupAddress = async (credentials) => {
  let fromEnv = pickupFromEnv();
  if (fromEnv) {
    fromEnv = await enrichAddressWithBostaDistrict(fromEnv, credentials, {
      cityName: process.env.BOSTA_PICKUP_CITY?.trim(),
      districtName:
        process.env.BOSTA_PICKUP_DISTRICT_NAME?.trim() ||
        process.env.BOSTA_PICKUP_ZONE?.trim(),
    });
    return fromEnv;
  }

  const fromApi = await fetchBostaPickupAddress(credentials);
  if (fromApi) return fromApi;

  const err = new Error(
    "Pickup address is required: send pickupAddress in the request body or configure Bosta pickup in the dashboard / .env",
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
