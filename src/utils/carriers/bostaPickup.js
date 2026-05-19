// src/utils/carriers/bostaPickup.js
import CarrierPickup from '../../models/CarrierPickup.js';
import {
  bostaRequest,
  splitBostaContactName,
  buildBostaAddress,
  enrichBostaAddress,
  fetchBostaCityDistricts,
} from './bosta.js';

const PICKUP_LOCATIONS_PATH = '/api/v2/pickup-locations';

const parsePickupList = (res) => {
  const raw = res?.data?.list ?? res?.data?.pickupLocations ?? [];
  return Array.isArray(raw) ? raw : [];
};

export const extractBostaLocationId = (res) => {
  const loc = res?.data ?? res;
  return loc?._id ?? loc?.id ?? null;
};

export const buildPickupLocationContact = ({ name, email, phone, isDefault } = {}) => {
  const { firstName, lastName } = splitBostaContactName(name);
  const contact = { firstName, lastName, phone: String(phone || '').trim() };
  const mail = String(email || '').trim();
  if (mail) contact.email = mail;
  if (isDefault === true) contact.isDefault = true;
  return contact;
};

export const buildPickupLocationAddress = ({
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
    city: String(city || '').trim(),
    firstLine: String(firstLine || '').trim(),
  };
  const zid = String(zoneId || '').trim();
  const did = String(districtId || '').trim();
  if (zid) addr.zoneId = zid;
  if (did) addr.districtId = did;
  if (secondLine) addr.secondLine = String(secondLine).trim();
  if (floor) addr.floor = floor;
  if (apartment) addr.apartment = apartment;
  if (buildingNumber) addr.buildingNumber = buildingNumber;
  return addr;
};

export const buildPickupLocationPayload = (body) => {
  const { address, contactPerson } = body;
  const isDefault = body.isDefault === true;
  return {
    locationName: body.locationName,
    contacts: [buildPickupLocationContact({ ...contactPerson, isDefault })],
    address: buildPickupLocationAddress(address),
  };
};

export const mapBostaPickupToLocal = (loc) => {
  const addr = loc?.address ?? {};
  const city = typeof addr.city === 'object' ? addr.city?.name : addr.city;
  const zone = typeof addr.zone === 'object' ? addr.zone : null;
  const district = typeof addr.district === 'object' ? addr.district : null;
  const rawContact = loc?.contactPerson ?? loc?.contacts?.[0];
  const contactName =
    rawContact?.name ||
    [rawContact?.firstName, rawContact?.lastName].filter(Boolean).join(' ').trim();

  return {
    locationName: loc?.locationName || 'Pickup',
    bostaLocationId: loc?._id ?? loc?.id ?? null,
    isDefault: !!loc?.isDefault,
    contactPerson: {
      name: contactName || 'Contact',
      email: rawContact?.email || '',
      phone: String(rawContact?.phone || '').replace(/^\+20/, '0'),
    },
    address: {
      firstLine: addr.firstLine ?? '',
      secondLine: addr.secondLine || '',
      city: city || '',
      cityId: typeof addr.city === 'object' ? addr.city?._id : addr.cityId ?? null,
      zoneId: zone?._id ?? addr.zoneId ?? null,
      districtId: district?._id ?? addr.districtId ?? null,
      districtName: district?.name ?? zone?.name ?? null,
    },
  };
};

const pickupDocToDeliveryAddress = (pickupDoc) => {
  const { address } = pickupDoc ?? {};
  if (!address?.firstLine) return null;
  return buildBostaAddress({
    city: address.city,
    cityId: address.cityId,
    zone: address.districtName || address.city,
    districtId: address.districtId,
    firstLine: address.firstLine,
    secondLine: address.secondLine,
  });
};

const pickupAddressFromEnv = () => {
  const city = process.env.BOSTA_PICKUP_CITY?.trim();
  const firstLine = process.env.BOSTA_PICKUP_FIRST_LINE?.trim();
  if (!city || !firstLine) return null;
  return buildBostaAddress({
    city,
    zone: process.env.BOSTA_PICKUP_ZONE?.trim() || city,
    districtId: process.env.BOSTA_PICKUP_DISTRICT_ID?.trim(),
    firstLine,
    secondLine: process.env.BOSTA_PICKUP_SECOND_LINE?.trim(),
  });
};

const bostaLocationToDeliveryAddress = (loc) => {
  const mapped = mapBostaPickupToLocal(loc);
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

export const listBostaPickupLocations = (credentials) =>
  bostaRequest('GET', PICKUP_LOCATIONS_PATH, null, credentials).then(parsePickupList);

export const createBostaPickupLocation = (payload, credentials) =>
  bostaRequest('POST', PICKUP_LOCATIONS_PATH, payload, credentials);

export const deleteBostaPickupLocation = (locationId, credentials) =>
  bostaRequest('DELETE', `${PICKUP_LOCATIONS_PATH}/${locationId}`, null, credentials);

export const isBostaAlreadyDefaultError = (err) => {
  const msg = String(err?.message || '').toLowerCase();
  return msg.includes('already the default') || msg.includes('already default');
};

export const setBostaDefaultPickupLocation = async (locationId, credentials) => {
  try {
    return await bostaRequest(
      'PUT',
      `${PICKUP_LOCATIONS_PATH}/${locationId}/default`,
      null,
      credentials
    );
  } catch (err) {
    if (isBostaAlreadyDefaultError(err)) return null;
    throw err;
  }
};

/** Align Mongo isDefault flags with Bosta (source of truth). */
export const reconcilePickupDefaultsFromBosta = async (carrierId, credentials) => {
  const list = await listBostaPickupLocations(credentials);
  if (!list.length) return;

  const defaultBostaId =
    list.find((l) => l.isDefault)?._id ?? list.find((l) => l.isDefault)?.id ?? null;

  await CarrierPickup.updateMany({ carrier: carrierId }, { $set: { isDefault: false } });

  if (defaultBostaId) {
    await CarrierPickup.updateOne(
      { carrier: carrierId, bostaLocationId: defaultBostaId },
      { $set: { isDefault: true } }
    );
  }
};

export const fetchBostaDistricts = (credentials) => fetchBostaCityDistricts(credentials);

export const syncPickupsToDb = async (carrierId, credentials) => {
  const list = await listBostaPickupLocations(credentials);
  const synced = [];

  for (const loc of list) {
    const mapped = mapBostaPickupToLocal(loc);
    if (!mapped.bostaLocationId) continue;

    let doc = await CarrierPickup.findOne({
      carrier: carrierId,
      bostaLocationId: mapped.bostaLocationId,
    });

    if (doc) {
      Object.assign(doc, mapped);
      await doc.save();
    } else {
      doc = await CarrierPickup.create({ carrier: carrierId, ...mapped });
    }
    synced.push(doc);
  }

  return synced;
};

export const listPickupsFromDb = (carrierId) =>
  CarrierPickup.find({ carrier: carrierId }).sort({ isDefault: -1, createdAt: 1 });

export const findDefaultPickup = async (carrierId, credentials) => {
  let pickup =
    (await CarrierPickup.findOne({ carrier: carrierId, isDefault: true })) ||
    (await CarrierPickup.findOne({ carrier: carrierId }).sort({ createdAt: 1 }));

  if (pickup || !credentials) return pickup;

  try {
    await reconcilePickupDefaultsFromBosta(carrierId, credentials);
  } catch {
    return null;
  }

  return (
    (await CarrierPickup.findOne({ carrier: carrierId, isDefault: true })) ||
    (await CarrierPickup.findOne({ carrier: carrierId }).sort({ createdAt: 1 }))
  );
};

export const resolveDeliveryPickupAddress = async (credentials, { pickupDoc } = {}) => {
  if (pickupDoc) {
    const fromDb = pickupDocToDeliveryAddress(pickupDoc);
    if (fromDb) {
      return enrichBostaAddress(fromDb, credentials, {
        cityName: pickupDoc.address?.city,
        districtName: pickupDoc.address?.districtName,
        districtId: pickupDoc.address?.districtId,
      });
    }
  }

  let fromEnv = pickupAddressFromEnv();
  if (fromEnv) {
    return enrichBostaAddress(fromEnv, credentials, {
      cityName: process.env.BOSTA_PICKUP_CITY?.trim(),
      districtName:
        process.env.BOSTA_PICKUP_DISTRICT_NAME?.trim() ||
        process.env.BOSTA_PICKUP_ZONE?.trim(),
    });
  }

  const list = await listBostaPickupLocations(credentials);
  const loc = list.find((l) => l.isDefault) || list[0];
  const fromApi = loc ? bostaLocationToDeliveryAddress(loc) : null;
  if (fromApi) {
    return enrichBostaAddress(fromApi, credentials, {
      cityName: typeof loc.address?.city === 'object' ? loc.address.city.name : loc.address?.city,
      districtId: loc.address?.district?._id ?? loc.address?.districtId,
    });
  }

  const err = new Error(
    'No Bosta pickup location configured. Add a default pickup in shipping admin.',
  );
  err.statusCode = 400;
  throw err;
};

export const carrierIdsWithDefaultPickup = () =>
  CarrierPickup.find({ isDefault: true }).distinct('carrier');
