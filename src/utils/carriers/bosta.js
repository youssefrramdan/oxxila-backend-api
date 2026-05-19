// src/utils/carriers/bosta.js

export const splitBostaContactName = (fullName) => {
  const parts = (fullName || "").trim().split(/\s+/).filter(Boolean);
  const firstName = parts[0] || "Contact";
  const lastName = parts.slice(1).join(" ") || firstName;
  return { firstName, lastName };
};

export const buildBostaPickupLocationContact = ({ name, email, phone, isDefault } = {}) => {
  const { firstName, lastName } = splitBostaContactName(name);
  const contact = {
    firstName,
    lastName,
    phone: String(phone || "").trim(),
  };
  const mail = String(email || "").trim();
  if (mail) contact.email = mail;
  if (isDefault === true) contact.isDefault = true;
  return contact;
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
  // districtId alone is enough for Bosta; districtName requires cityId peer
  if (distId) {
    addr.districtId = distId;
  } else if (distName && cid) {
    addr.districtName = distName;
  } else if (cid && addr.zone) {
    addr.districtName = addr.zone;
  }
  if (secondLine) addr.secondLine = String(secondLine).trim();
  return addr;
};

/** POST /api/v2/pickup-locations — see Bosta docs (city, zoneId, districtId, firstLine, …). */
export const buildBostaPickupLocationAddress = ({
  city,
  zoneId,
  districtId,
  firstLine,
  secondLine,
  floor,
  apartment,
  buildingNumber,
} = {}) => {
  const addr = {
    city: String(city || "").trim(),
    firstLine: String(firstLine || "").trim(),
  };
  const zid = String(zoneId || "").trim();
  const did = String(districtId || "").trim();
  if (zid) addr.zoneId = zid;
  if (did) addr.districtId = did;
  if (secondLine) addr.secondLine = String(secondLine).trim();
  if (floor) addr.floor = floor;
  if (apartment) addr.apartment = apartment;
  if (buildingNumber) addr.buildingNumber = buildingNumber;
  return addr;
};

export const mapBostaPickupLocationToLocal = (loc) => {
  const addr = loc?.address ?? {};
  const city =
    typeof addr.city === "object" ? addr.city?.name : addr.city;
  const zone =
    typeof addr.zone === "object" ? addr.zone : null;
  const district =
    typeof addr.district === "object" ? addr.district : null;
  const rawContact = loc?.contactPerson ?? loc?.contacts?.[0];
  const contactName =
    rawContact?.name ||
    [rawContact?.firstName, rawContact?.lastName].filter(Boolean).join(" ").trim();

  return {
    locationName: loc?.locationName || "Pickup",
    bostaLocationId: loc?._id ?? loc?.id ?? null,
    isDefault: !!loc?.isDefault,
    contactPerson: {
      name: contactName || "Contact",
      email: rawContact?.email || "",
      phone: String(rawContact?.phone || "").replace(/^\+20/, "0"),
    },
    address: {
      firstLine: addr.firstLine ?? addr.first_line ?? "",
      secondLine: addr.secondLine || "",
      floor: addr.floor != null ? String(addr.floor) : "",
      apartment: addr.apartment != null ? String(addr.apartment) : "",
      city: city || "",
      cityId:
        typeof addr.city === "object"
          ? addr.city?._id
          : addr.cityId ?? null,
      zoneId: zone?._id ?? addr.zoneId ?? null,
      districtId: district?._id ?? addr.districtId ?? null,
      districtName: district?.name ?? zone?.name ?? null,
    },
  };
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
    matched?.districtName || hints.districtName || addr.districtName || addr.zone;

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
  const mapped = mapBostaPickupLocationToLocal(loc);
  if (!mapped.address.city || !mapped.address.firstLine) return null;
  return buildBostaAddress({
    city: mapped.address.city,
    cityId: mapped.address.cityId,
    zone: mapped.address.districtName || mapped.address.city,
    districtId: mapped.address.districtId,
    firstLine: mapped.address.firstLine,
    secondLine: mapped.address.secondLine,
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
        res.data?.list ??
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

const pickupDocToBostaAddress = (pickupDoc) => {
  if (!pickupDoc?.address?.firstLine) return null;
  const { address } = pickupDoc;
  return buildBostaAddress({
    city: address.city,
    cityId: address.cityId,
    zone: address.districtName || address.city,
    districtId: address.districtId,
    districtName: address.districtName,
    firstLine: address.firstLine,
    secondLine: address.secondLine,
  });
};

export const listBostaPickupLocations = async (credentials) => {
  const res = await bostaRequest("GET", "/api/v2/pickup-locations", null, credentials);
  const list = res.data?.list ?? res.data?.pickupLocations ?? [];
  return Array.isArray(list) ? list : [];
};

export const createBostaPickupLocation = async (payload, credentials) =>
  bostaRequest("POST", "/api/v2/pickup-locations", payload, credentials);

export const updateBostaPickupLocation = async (locationId, payload, credentials) =>
  bostaRequest("PUT", `/api/v2/pickup-locations/${locationId}`, payload, credentials);

export const deleteBostaPickupLocation = async (locationId, credentials) =>
  bostaRequest("DELETE", `/api/v2/pickup-locations/${locationId}`, null, credentials);

export const setBostaDefaultPickupLocation = async (locationId, credentials) =>
  bostaRequest("PUT", `/api/v2/pickup-locations/${locationId}/default`, null, credentials);

export const resolveBostaPickupAddress = async (credentials, { defaultPickupFromDb } = {}) => {
  if (defaultPickupFromDb) {
    const fromDb = pickupDocToBostaAddress(defaultPickupFromDb);
    if (fromDb) {
      return enrichAddressWithBostaDistrict(fromDb, credentials, {
        cityName: defaultPickupFromDb.address?.city,
        districtName: defaultPickupFromDb.address?.districtName,
        districtId: defaultPickupFromDb.address?.districtId,
      });
    }
  }

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
    "Bosta pickup address is not configured. Add a pickup location in the shipping admin or set BOSTA_PICKUP_* in .env",
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
  const { firstName, lastName } = splitBostaContactName(params.receiverName);
  const specs = buildBostaSpecs(params.packageSpecs);
  const pickupAddress =
    params.pickupAddress ??
    (await resolveBostaPickupAddress(credentials, {
      defaultPickupFromDb: params.defaultPickupFromDb,
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

export const trackBostaDelivery = async (trackingNumber, credentials) =>
  bostaRequest(
    "GET",
    `/api/v2/deliveries/tracking/${trackingNumber}`,
    null,
    credentials,
  );

export const cancelBostaDelivery = async (deliveryId, credentials) =>
  bostaRequest("DELETE", `/api/v2/deliveries/${deliveryId}`, null, credentials);
