// src/controllers/carrierPickup.controller.js
import asyncHandler from 'express-async-handler';
import Carrier from '../models/Carrier.js';
import CarrierPickup from '../models/CarrierPickup.js';
import ApiError from '../utils/apiError.js';
import sendResponse from '../utils/apiResponse.js';
import {
  bostaRequest,
  normalizeEgyptPhone,
  splitBostaContactName,
  fetchBostaCityDistricts,
  getBostaCarrierContext,
  buildBostaAddress,
} from './orderShipping.controller.js';
import { recordAdminActivity } from '../utils/adminActivity.js';

const PICKUP_PATH = '/api/v2/pickup-locations';

// --- Bosta pickup-location HTTP wrappers ---

/** Extract pickup-location list from a Bosta API response. */
const parsePickupList = (res) => {
  const raw = res?.data?.list ?? res?.data?.pickupLocations ?? [];
  return Array.isArray(raw) ? raw : [];
};

/** GET all pickup locations from Bosta for the given credentials. */
const listBostaPickupLocations = (credentials) =>
  bostaRequest('GET', PICKUP_PATH, null, credentials).then(parsePickupList);

/** POST a new pickup location to Bosta. */
const createBostaPickupLocation = (payload, credentials) =>
  bostaRequest('POST', PICKUP_PATH, payload, credentials);

/** DELETE a Bosta pickup location by external id. */
const deleteBostaPickupLocation = (locationId, credentials) =>
  bostaRequest('DELETE', `${PICKUP_PATH}/${locationId}`, null, credentials);

/** True when Bosta says the location is already the default. */
const isBostaAlreadyDefaultError = (err) => {
  const msg = String(err?.message || '').toLowerCase();
  return msg.includes('already the default') || msg.includes('already default');
};

/** PUT Bosta default pickup; no-op if already default. */
const setBostaDefaultPickupLocation = async (locationId, credentials) => {
  try {
    return await bostaRequest('PUT', `${PICKUP_PATH}/${locationId}/default`, null, credentials);
  } catch (err) {
    if (isBostaAlreadyDefaultError(err)) return null;
    throw err;
  }
};

/** Extract external location id from a Bosta create response. */
const extractBostaLocationId = (res) => {
  const loc = res?.data ?? res;
  return loc?._id ?? loc?.id ?? null;
};

// --- Bosta <-> local pickup payload mapping ---

/** Build Bosta contact payload from contactPerson fields. */
const buildPickupLocationContact = ({ name, email, phone } = {}) => {
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

/** Build Bosta address payload for pickup-location create. */
const buildPickupLocationAddress = ({
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

/** Build full Bosta create-pickup-location request body. */
const buildPickupLocationPayload = (body) => {
  const { address, contactPerson } = body;
  return {
    locationName: body.locationName,
    contacts: [buildPickupLocationContact(contactPerson)],
    address: buildPickupLocationAddress(address),
  };
};

/** Map a Bosta pickup-location object to local CarrierPickup fields. */
const mapBostaPickupToLocal = (loc) => {
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

// --- local DB sync/reconciliation ---

/**
 * Sync local isDefault flags from Bosta list.
 * When preferredBostaLocationId is set (just after create/set-default), prefer that id —
 * Bosta's list can lag and otherwise wipe the intended default.
 */
const reconcilePickupDefaultsFromBosta = async (
  carrierId,
  credentials,
  { preferredBostaLocationId = null } = {}
) => {
  const preferred = preferredBostaLocationId ? String(preferredBostaLocationId) : null;

  if (preferred) {
    await CarrierPickup.updateMany({ carrier: carrierId }, { $set: { isDefault: false } });
    await CarrierPickup.updateOne(
      { carrier: carrierId, bostaLocationId: preferred },
      { $set: { isDefault: true } }
    );
    return;
  }

  const list = await listBostaPickupLocations(credentials);
  if (!list.length) return;

  const defaultBostaId =
    list.find((l) => l.isDefault)?._id ?? list.find((l) => l.isDefault)?.id ?? null;

  await CarrierPickup.updateMany({ carrier: carrierId }, { $set: { isDefault: false } });

  if (defaultBostaId) {
    await CarrierPickup.updateOne(
      { carrier: carrierId, bostaLocationId: String(defaultBostaId) },
      { $set: { isDefault: true } }
    );
  }
};

/** Upsert all Bosta pickup locations into local CarrierPickup docs. */
const syncPickupsToDb = async (carrierId, credentials) => {
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

/** List local CarrierPickup docs for a carrier (default first). */
const listPickupsFromDb = (carrierId) =>
  CarrierPickup.find({ carrier: carrierId }).sort({ isDefault: -1, createdAt: 1 });

/** Assign flow: DB only — admin must choose pickupId (no Bosta API call on assign). */
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

/** Convert a CarrierPickup doc's address into a Bosta-shaped address (delivery/return fallback). */
export const pickupDocToBostaAddress = (pickupDoc) => {
  const { address } = pickupDoc ?? {};
  if (!address?.firstLine) return null;
  return buildBostaAddress({
    city: address.city,
    cityId: address.cityId,
    zoneId: address.zoneId,
    districtId: address.districtId,
    districtName: address.districtName,
    firstLine: address.firstLine,
    secondLine: address.secondLine,
    floor: address.floor,
    apartment: address.apartment,
    buildingNumber: address.buildingNumber,
  });
};

// --- guards / shared error translation ---

/** Load a CarrierPickup by id scoped to carrier, or 404. */
const findPickup = async (carrierId, pickupId) => {
  const pickup = await CarrierPickup.findOne({ _id: pickupId, carrier: carrierId });
  if (!pickup) {
    throw new ApiError(`No pickup found with id: ${pickupId}`, 404);
  }
  return pickup;
};

/** Re-wrap unknown errors as ApiError with a fallback message. */
const bostaApiError = (err, fallback) =>
  err instanceof ApiError ? err : new ApiError(err.message || fallback, err.statusCode || 502);

/** Coerce common truthy flag forms (true/"true"/1/"1"). */
const isTruthyFlag = (value) => value === true || value === 'true' || value === 1 || value === '1';

// --- handlers ---

/**
 * @desc    List carrier pickup locations (from local DB — use the sync endpoint to import from Bosta)
 * @route   GET /api/v1/admin/carriers/:id/pickups
 * @access  Admin
 */
export const getCarrierPickups = asyncHandler(async (req, res) => {
  const ctx = await getBostaCarrierContext(req.params.id);

  const pickups = await listPickupsFromDb(ctx.carrier._id);

  sendResponse(res, { message: 'Pickup locations retrieved successfully', data: pickups });
});

/**
 * @desc    Bosta cities/districts for pickup form
 * @route   GET /api/v1/admin/carriers/:id/bosta/districts-lookup
 * @access  Admin
 */
export const getBostaDistrictsLookup = asyncHandler(async (req, res) => {
  const ctx = await getBostaCarrierContext(req.params.id);

  const cities = await fetchBostaCityDistricts(ctx.credentials);
  sendResponse(res, { message: 'Bosta districts retrieved successfully', data: cities });
});

/**
 * @desc    Create pickup on Bosta and store locally
 * @route   POST /api/v1/admin/carriers/:id/pickups
 * @access  Admin
 */
export const createCarrierPickup = asyncHandler(async (req, res) => {
  const ctx = await getBostaCarrierContext(req.params.id);

  let bostaRes;
  try {
    bostaRes = await createBostaPickupLocation(
      buildPickupLocationPayload(req.body),
      ctx.credentials
    );
  } catch (err) {
    throw bostaApiError(err, 'Bosta pickup location creation failed');
  }

  const bostaLocationId = extractBostaLocationId(bostaRes);
  const isDefault =
    isTruthyFlag(req.body.isDefault) ||
    (await CarrierPickup.countDocuments({ carrier: ctx.carrier._id })) === 0;

  const pickup = await CarrierPickup.create({
    carrier: ctx.carrier._id,
    locationName: req.body.locationName,
    contactPerson: req.body.contactPerson,
    address: req.body.address,
    bostaLocationId,
    isDefault,
  });

  if (isDefault && bostaLocationId) {
    await setBostaDefaultPickupLocation(bostaLocationId, ctx.credentials);
    await reconcilePickupDefaultsFromBosta(ctx.carrier._id, ctx.credentials, {
      preferredBostaLocationId: bostaLocationId,
    });
  } else if (!isDefault) {
    await reconcilePickupDefaultsFromBosta(ctx.carrier._id, ctx.credentials);
  }
  const saved = await CarrierPickup.findById(pickup._id);

  recordAdminActivity(req, {
    tab: 'shipping',
    action: 'create',
    resourceType: 'carrierPickup',
    resourceId: pickup._id,
    resourceLabel: req.body.locationName,
    summary: `Created pickup location "${req.body.locationName}"`,
  });

  sendResponse(res, {
    statusCode: 201,
    message: 'Pickup location created successfully',
    data: saved ?? pickup,
  });
});

/**
 * @desc    Delete pickup
 * @route   DELETE /api/v1/admin/carriers/:id/pickups/:pickupId
 * @access  Admin
 */
export const deleteCarrierPickup = asyncHandler(async (req, res) => {
  const ctx = await getBostaCarrierContext(req.params.id);

  const pickup = await findPickup(ctx.carrier._id, req.params.pickupId);

  recordAdminActivity(req, {
    tab: 'shipping',
    action: 'delete',
    resourceType: 'carrierPickup',
    resourceId: pickup._id,
    resourceLabel: pickup.locationName,
    summary: `Deleted pickup location "${pickup.locationName}"`,
  });

  if (pickup.bostaLocationId) {
    try {
      await deleteBostaPickupLocation(pickup.bostaLocationId, ctx.credentials);
    } catch {
      // Bosta may block delete on the account default — still remove locally
    }
  }

  await pickup.deleteOne();
  sendResponse(res, { message: 'Pickup location deleted successfully' });
});

/**
 * @desc    Set default pickup
 * @route   PUT /api/v1/admin/carriers/:id/pickups/:pickupId/default
 * @access  Admin
 */
export const setDefaultCarrierPickup = asyncHandler(async (req, res) => {
  const ctx = await getBostaCarrierContext(req.params.id);

  const pickup = await findPickup(ctx.carrier._id, req.params.pickupId);

  if (pickup.bostaLocationId) {
    try {
      await setBostaDefaultPickupLocation(pickup.bostaLocationId, ctx.credentials);
    } catch (err) {
      throw bostaApiError(err, 'Could not set default pickup on Bosta');
    }
    await reconcilePickupDefaultsFromBosta(ctx.carrier._id, ctx.credentials, {
      preferredBostaLocationId: pickup.bostaLocationId,
    });
  } else {
    pickup.isDefault = true;
    await pickup.save();
  }

  const updated = await CarrierPickup.findById(pickup._id);

  recordAdminActivity(req, {
    tab: 'shipping',
    action: 'update',
    resourceType: 'carrierPickup',
    resourceId: pickup._id,
    resourceLabel: pickup.locationName,
    summary: `Set default pickup location "${pickup.locationName}"`,
  });

  sendResponse(res, {
    message: 'Default pickup location updated successfully',
    data: updated ?? pickup,
  });
});

/**
 * @desc    Import pickup locations from Bosta into DB (one-time / manual)
 * @route   POST /api/v1/admin/carriers/:id/bosta/sync-pickups
 * @access  Admin
 */
export const syncBostaPickupsForCarrier = asyncHandler(async (req, res) => {
  const ctx = await getBostaCarrierContext(req.params.id);

  try {
    await syncPickupsToDb(ctx.carrier._id, ctx.credentials);
  } catch (err) {
    throw bostaApiError(err, 'Failed to sync pickups from Bosta');
  }

  const pickups = await listPickupsFromDb(ctx.carrier._id);

  recordAdminActivity(req, {
    tab: 'shipping',
    action: 'sync',
    resourceType: 'carrierPickup',
    resourceId: ctx.carrier._id,
    resourceLabel: ctx.carrier.name,
    summary: `Synced pickup locations from Bosta for "${ctx.carrier.name}"`,
  });

  sendResponse(res, {
    message: 'Pickup locations synced from Bosta successfully',
    data: pickups,
  });
});

/**
 * @desc    List all pickup locations across active Bosta carriers (admin overview)
 * @route   GET /api/v1/admin/carriers/bosta-pickups
 * @access  Admin
 */
export const getBostaPickupLocations = asyncHandler(async (req, res) => {
  const bostaCarriers = await Carrier.find({ apiProvider: 'bosta', type: 'api', isActive: true }).select(
    '_id name'
  );

  const pickups = await CarrierPickup.find({ carrier: { $in: bostaCarriers.map((c) => c._id) } })
    .select('carrier locationName bostaLocationId isDefault address')
    .populate('carrier', 'name')
    .sort({ isDefault: -1, locationName: 1 })
    .limit(200)
    .lean();

  sendResponse(res, { message: 'Bosta pickup locations retrieved successfully', data: pickups });
});
