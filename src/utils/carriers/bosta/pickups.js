// src/utils/carriers/bosta/pickups.js
import CarrierPickup from '../../../models/CarrierPickup.js';
import ApiError from '../../apiError.js';
import { bostaRequest, normalizeEgyptPhone, splitBostaContactName } from './client.js';
import { buildBostaAddress, enrichBostaAddress } from './addresses.js';

const PICKUP_PATH = '/api/v2/pickup-locations';

const parsePickupList = (res) => {
  const raw = res?.data?.list ?? res?.data?.pickupLocations ?? [];
  return Array.isArray(raw) ? raw : [];
};

export const extractBostaLocationId = (res) => {
  const loc = res?.data ?? res;
  return loc?._id ?? loc?.id ?? null;
};

export const buildPickupLocationContact = ({ name, email, phone } = {}) => {
  const { firstName, lastName } = splitBostaContactName(name);
  const contact = {
    firstName,
    lastName,
    phone: normalizeEgyptPhone(phone) || String(phone || '').trim(),
    isDefault: true,
  };
  const mail = String(email || '').trim();
  if (mail) contact.email = mail;
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
  return {
    locationName: body.locationName,
    contacts: [buildPickupLocationContact(contactPerson)],
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

const pickupDocToAddress = (pickupDoc) => {
  const { address } = pickupDoc ?? {};
  if (!address?.firstLine) return null;
  return buildBostaAddress({
    city: address.city,
    cityId: address.cityId,
    zoneId: address.zoneId,
    districtId: address.districtId,
    firstLine: address.firstLine,
    secondLine: address.secondLine,
  });
};

export const listBostaPickupLocations = (credentials) =>
  bostaRequest('GET', PICKUP_PATH, null, credentials).then(parsePickupList);

export const createBostaPickupLocation = (payload, credentials) =>
  bostaRequest('POST', PICKUP_PATH, payload, credentials);

export const deleteBostaPickupLocation = (locationId, credentials) =>
  bostaRequest('DELETE', `${PICKUP_PATH}/${locationId}`, null, credentials);

export const isBostaAlreadyDefaultError = (err) => {
  const msg = String(err?.message || '').toLowerCase();
  return msg.includes('already the default') || msg.includes('already default');
};

export const setBostaDefaultPickupLocation = async (locationId, credentials) => {
  try {
    return await bostaRequest('PUT', `${PICKUP_PATH}/${locationId}/default`, null, credentials);
  } catch (err) {
    if (isBostaAlreadyDefaultError(err)) return null;
    throw err;
  }
};

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

/** Assign flow: DB only — admin must choose pickupId (no Bosta API on assign). */
export const getPickupForAssign = async (carrierId, pickupId) => {
  if (!pickupId) {
    throw new ApiError('Pickup location is required for Bosta assignment', 400);
  }
  const pickup = await CarrierPickup.findOne({ _id: pickupId, carrier: carrierId });
  if (!pickup) {
    throw new ApiError(`No pickup found with id: ${pickupId} for this carrier`, 404);
  }
  const hasBostaId = Boolean(pickup.bostaLocationId);
  const hasAddressIds =
    Boolean(pickup.address?.cityId) && Boolean(pickup.address?.districtId);
  if (!hasBostaId && !hasAddressIds && !pickup.address?.firstLine) {
    throw new ApiError(
      'Pickup location is incomplete. Import pickups from Bosta in carrier settings.',
      400
    );
  }
  return pickup;
};

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
  const fromDb = pickupDoc ? pickupDocToAddress(pickupDoc) : null;
  if (fromDb?.districtId && fromDb?.cityId) {
    return enrichBostaAddress(fromDb, credentials, { skipEnrich: true });
  }
  if (fromDb) {
    return enrichBostaAddress(fromDb, credentials, {
      cityName: pickupDoc.address?.city,
      districtName: pickupDoc.address?.districtName,
      districtId: pickupDoc.address?.districtId,
    });
  }

  const list = await listBostaPickupLocations(credentials);
  const loc = list.find((l) => l.isDefault) || list[0];
  if (!loc) {
    const err = new Error('No Bosta pickup location configured. Sync pickups in shipping admin.');
    err.statusCode = 400;
    throw err;
  }

  const mapped = mapBostaPickupToLocal(loc);
  const addr = buildBostaAddress({
    city: mapped.address.city,
    cityId: mapped.address.cityId,
    zoneId: mapped.address.zoneId,
    districtId: mapped.address.districtId,
    firstLine: mapped.address.firstLine,
    secondLine: mapped.address.secondLine,
  });

  if (addr.districtId && addr.cityId) {
    return enrichBostaAddress(addr, credentials, { skipEnrich: true });
  }

  return enrichBostaAddress(addr, credentials, {
    cityName: mapped.address.city,
    districtId: mapped.address.districtId,
  });
};

export const carrierIdsWithDefaultPickup = () =>
  CarrierPickup.find({ isDefault: true }).distinct('carrier');

export const carrierIdsWithAnyPickup = () =>
  CarrierPickup.distinct('carrier');
