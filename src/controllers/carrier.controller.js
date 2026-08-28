// src/controllers/carrier.controller.js
import asyncHandler from "express-async-handler";
import Carrier from "../models/Carrier.js";
import CarrierCoverage from "../models/CarrierCoverage.js";
import CarrierPickup from "../models/CarrierPickup.js";
import Country from "../models/Country.js";
import Governorate from "../models/Governorate.js";
import District from "../models/District.js";
import CarrierZoneMapping from "../models/CarrierZoneMapping.js";
import ApiError from "../utils/apiError.js";
import sendResponse from "../utils/apiResponse.js";
import { resolveCarrierDeliveryDays } from "../utils/carrierDeliveryDays.js";
import {
  normalizeBostaBaseUrl,
  fetchBostaCityDistricts,
  getBostaCarrierContext,
} from "./orderShipping.controller.js";
import { remapAllZoneRefsAfterSync } from "./order.controller.js";

/** Convert a Mongoose doc to a plain object when needed. */
const toPlainDoc = (doc) => (typeof doc?.toObject === "function" ? doc.toObject() : doc);

// ── Admin presentation ──

/** Strip apiKey and attach coverage governorate names for admin list/detail. */
const mapCarrierForAdmin = (c, coverages) => ({
  ...toPlainDoc(c),
  hasApiKey: Boolean(c.apiKey),
  apiBaseUrl: c.apiBaseUrl ? normalizeBostaBaseUrl(c.apiBaseUrl) : null,
  apiKey: undefined,
  coverage: coverages
    .filter((cv) => cv.carrier.toString() === c._id.toString())
    .map((cv) => cv.governorate?.name)
    .filter(Boolean),
});

// ── Bosta zone / coverage sync ──

/** Normalize a zone label for fuzzy matching. */
const normalizeLabel = (value) => String(value || "").trim().toLowerCase();

/** Single fuzzy label matcher shared by governorate and district matching below. */
const fuzzyLabelMatch = (needles, candidates, getName) => {
  const normalizedNeedles = needles.map(normalizeLabel).filter(Boolean);
  return candidates.find((candidate) => {
    const name = normalizeLabel(getName(candidate));
    return normalizedNeedles.some(
      (needle) => needle.length > 2 && (needle === name || name.includes(needle) || needle.includes(name))
    );
  });
};

/** Match a Bosta city to a local Governorate by name/code aliases. */
const matchGovernorate = (governorates, city) =>
  fuzzyLabelMatch([city.cityName, city.cityOtherName, city.cityCode], governorates, (g) => g.name);

/** Match a Bosta district/zone to a local District by name aliases. */
const matchDistrict = (districts, bostaDistrict) =>
  fuzzyLabelMatch(
    [bostaDistrict.districtName, bostaDistrict.districtOtherName, bostaDistrict.zoneName, bostaDistrict.zoneOtherName],
    districts,
    (d) => d.name
  );

/** Build a CarrierZoneMapping bulkWrite upsert op. */
const mappingUpsertOp = (carrierId, zoneType, zoneId, data) => ({
  updateOne: {
    filter: { carrier: carrierId, zoneType, zoneId },
    update: { $set: { carrier: carrierId, zoneType, zoneId, ...data } },
    upsert: true,
  },
});

/** Index districts by governorate id for O(1) lookups during sync. */
const buildDistrictsByGov = (allDistricts) => {
  const districtsByGov = new Map();
  for (const d of allDistricts) {
    const key = String(d.governorate);
    if (!districtsByGov.has(key)) districtsByGov.set(key, []);
    districtsByGov.get(key).push(d);
  }
  return districtsByGov;
};

/** Flatten Bosta cities into serviceable (city, district) pairs. */
const collectBostaServiceableDistricts = (cities) => {
  const items = [];
  for (const city of cities) {
    if (city.dropOffAvailability === false) continue;
    for (const bd of city.districts || []) {
      if (bd.dropOffAvailability === false) continue;
      items.push({ city, bd });
    }
  }
  return items;
};

/** Mark unmatched districts in affected governorates as bostaCovered: false. */
const markUnmatchedBostaCoveredFalse = (affectedGovIds, matchedDistrictIds, districtsByGov, bulkOps) => {
  let bostaCoveredFalse = 0;
  for (const govId of affectedGovIds) {
    const districts = districtsByGov.get(govId) ?? [];
    for (const d of districts) {
      if (matchedDistrictIds.has(String(d._id))) continue;
      bulkOps.push({ updateOne: { filter: { _id: d._id }, update: { $set: { bostaCovered: false } } } });
      bostaCoveredFalse += 1;
    }
  }
  return bostaCoveredFalse;
};

/** Load an active Country by ISO code or throw. */
const requireActiveCountry = async (countryCode) => {
  const country = await Country.findOne({ code: countryCode.toUpperCase(), isActive: true });
  if (!country) {
    throw new ApiError(`No active country found with code: ${countryCode}`, 400);
  }
  return country;
};

/** Lightweight sync — updates District.bostaCovered only, no zones/mappings/coverage. */
export const syncBostaCoveredOnly = async (credentials, { countryCode = "EG" } = {}) => {
  const cities = await fetchBostaCityDistricts(credentials);
  const country = await requireActiveCountry(countryCode);

  const existingGovs = await Governorate.find({ country: country._id });
  const govIds = existingGovs.map((g) => g._id);
  const allDistricts = await District.find({ governorate: { $in: govIds } });
  const districtsByGov = buildDistrictsByGov(allDistricts);

  const matchedDistrictIds = new Set();
  const affectedGovIds = new Set();
  const bulkOps = [];
  let bostaCoveredTrue = 0;

  for (const { city, bd } of collectBostaServiceableDistricts(cities)) {
    const governorate = matchGovernorate(existingGovs, city);
    if (!governorate) continue;

    const govKey = String(governorate._id);
    affectedGovIds.add(govKey);
    const existingDistricts = districtsByGov.get(govKey) ?? [];
    const matched = matchDistrict(existingDistricts, bd);
    if (!matched) continue;

    matchedDistrictIds.add(String(matched._id));
    bulkOps.push({ updateOne: { filter: { _id: matched._id }, update: { $set: { bostaCovered: true } } } });
    bostaCoveredTrue += 1;
  }

  const bostaCoveredFalse = markUnmatchedBostaCoveredFalse(affectedGovIds, matchedDistrictIds, districtsByGov, bulkOps);

  if (bulkOps.length) await District.bulkWrite(bulkOps, { ordered: false });

  return { bostaCoveredTrue, bostaCoveredFalse };
};

/** Full sync — creates missing governorates/districts and upserts CarrierZoneMapping rows. */
const syncBostaZones = async (credentials, carrierId, { countryCode = "EG" } = {}) => {
  const cities = await fetchBostaCityDistricts(credentials);
  const country = await requireActiveCountry(countryCode);

  let governoratesMatched = 0;
  let districtsCreated = 0;
  let districtsUpdated = 0;
  let governoratesCreated = 0;

  const existingGovs = await Governorate.find({ country: country._id });
  const govIds = existingGovs.map((g) => g._id);
  const allDistricts = await District.find({ governorate: { $in: govIds } });
  const districtsByGov = buildDistrictsByGov(allDistricts);

  const districtBulkOps = [];
  const mappingBulkOps = [];
  const matchedDistrictIds = new Set();
  const affectedGovIds = new Set();

  for (const city of cities) {
    if (city.dropOffAvailability === false) continue;

    let governorate = matchGovernorate(existingGovs, city);
    if (!governorate) {
      governorate = await Governorate.create({
        country: country._id,
        name: city.cityName || city.cityOtherName || city.cityCode,
        shippingPrice: 0,
        isActive: true,
      });
      existingGovs.push(governorate);
      govIds.push(governorate._id);
      districtsByGov.set(String(governorate._id), []);
      governoratesCreated += 1;
    } else {
      governoratesMatched += 1;
    }

    const govKey = String(governorate._id);
    affectedGovIds.add(govKey);

    if (carrierId) {
      mappingBulkOps.push(
        mappingUpsertOp(carrierId, "governorate", governorate._id, {
          isServiceable: true,
          externalCityId: city.cityId,
          dropOffAvailable: true,
        })
      );
    }

    const existingDistricts = districtsByGov.get(govKey) ?? [];
    const bostaDistricts = city.districts || [];

    for (const bd of bostaDistricts) {
      if (bd.dropOffAvailability === false) continue;

      const matched = matchDistrict(existingDistricts, bd);
      if (matched) {
        matchedDistrictIds.add(String(matched._id));
        districtBulkOps.push({ updateOne: { filter: { _id: matched._id }, update: { $set: { bostaCovered: true } } } });
        districtsUpdated += 1;
        if (carrierId) {
          mappingBulkOps.push(
            mappingUpsertOp(carrierId, "district", matched._id, {
              isServiceable: true,
              externalCityId: city.cityId,
              externalDistrictId: bd.districtId,
              externalZoneId: bd.zoneId ?? null,
              dropOffAvailable: bd.dropOffAvailability !== false,
            })
          );
        }
      } else {
        const [created] = await District.create([
          {
            governorate: governorate._id,
            name: bd.districtName || bd.zoneName || "District",
            shippingPrice: governorate.shippingPrice ?? 0,
            isCovered: true,
            bostaCovered: true,
          },
        ]);
        matchedDistrictIds.add(String(created._id));
        existingDistricts.push(created);
        districtsByGov.set(govKey, existingDistricts);
        districtsCreated += 1;
        if (carrierId) {
          mappingBulkOps.push(
            mappingUpsertOp(carrierId, "district", created._id, {
              isServiceable: true,
              externalCityId: city.cityId,
              externalDistrictId: bd.districtId,
              externalZoneId: bd.zoneId ?? null,
              dropOffAvailable: bd.dropOffAvailability !== false,
            })
          );
        }
      }
    }
  }

  markUnmatchedBostaCoveredFalse(affectedGovIds, matchedDistrictIds, districtsByGov, districtBulkOps);

  if (districtBulkOps.length) await District.bulkWrite(districtBulkOps, { ordered: false });
  if (mappingBulkOps.length) await CarrierZoneMapping.bulkWrite(mappingBulkOps, { ordered: false });

  return {
    governoratesMatched,
    governoratesCreated,
    districtsCreated,
    districtsUpdated,
    mappingsUpserted: mappingBulkOps.length,
    citiesProcessed: cities.length,
  };
};

/** Full Bosta sync: zones + CarrierCoverage rebuild + remap stale zone refs. */
export const syncBostaCarrierCoverage = async (carrierId, credentials, options = {}) => {
  const zoneStats = await syncBostaZones(credentials, carrierId, options);

  const districtZoneIds = await CarrierZoneMapping.find({
    carrier: carrierId,
    zoneType: "district",
    isServiceable: true,
    dropOffAvailable: { $ne: false },
  }).distinct("zoneId");

  const coveredGovIds = await District.find({
    _id: { $in: districtZoneIds },
    isCovered: true,
  }).distinct("governorate");

  await CarrierCoverage.deleteMany({ carrier: carrierId });
  if (coveredGovIds.length > 0) {
    await CarrierCoverage.insertMany(
      coveredGovIds.map((governorate) => ({ carrier: carrierId, governorate, isActive: true }))
    );
  }

  const zoneRefRemap = await remapAllZoneRefsAfterSync();

  return { ...zoneStats, coverageGovernorates: coveredGovIds.length, zoneRefRemap };
};

// ── Route handlers ──

/**
 * @desc    List carriers with coverage summary (admin)
 * @route   GET /api/v1/admin/carriers
 * @access  Admin
 */
export const getCarriers = asyncHandler(async (req, res) => {
  const carriers = await Carrier.find().select("+apiKey +apiBaseUrl").sort({ name: 1 });

  const coverages = await CarrierCoverage.find({
    carrier: { $in: carriers.map((c) => c._id) },
  }).populate("governorate", "name");

  const data = carriers.map((c) => mapCarrierForAdmin(c, coverages));

  sendResponse(res, { message: "Carriers retrieved successfully", data });
});

/**
 * @desc    Create known/internal carrier (admin)
 * @route   POST /api/v1/admin/carriers
 * @access  Admin
 */
export const createCarrier = asyncHandler(async (req, res, next) => {
  const { name, code, type, logo, apiProvider, apiKey, apiBaseUrl } = req.body;

  const exists = await Carrier.findOne({ code: code.toUpperCase() });
  if (exists) return next(new ApiError("Carrier code already exists", 400));

  if (type === "api") {
    if (apiProvider !== "bosta") {
      return next(new ApiError("Only Bosta is supported as an API carrier", 400));
    }
    const bostaExists = await Carrier.findOne({ type: "api", apiProvider: "bosta" });
    if (bostaExists) {
      return next(
        new ApiError("A Bosta API carrier already exists. Edit the existing carrier instead.", 400)
      );
    }
  }

  let deliveryDays;
  try {
    deliveryDays = resolveCarrierDeliveryDays(req.body, { required: type !== "api" });
  } catch (error) {
    return next(new ApiError(error.message, 400));
  }

  const carrier = await Carrier.create({
    name,
    code,
    type,
    deliveryDays,
    logo,
    ...(type === "api"
      ? { apiProvider, apiKey, apiBaseUrl: apiBaseUrl ? normalizeBostaBaseUrl(apiBaseUrl) : null }
      : {}),
  });

  sendResponse(res, { statusCode: 201, message: "Carrier created successfully", data: { carrier } });
});

/**
 * @desc    Update carrier (admin)
 * @route   PUT /api/v1/admin/carriers/:id
 * @access  Admin
 */
export const updateCarrier = asyncHandler(async (req, res, next) => {
  delete req.body.type;
  delete req.body.apiProvider;

  const existing = await Carrier.findById(req.params.id).select("+apiKey +apiBaseUrl");
  if (!existing) return next(new ApiError(`No carrier found with id: ${req.params.id}`, 404));

  const update = { ...req.body };
  if (update.apiBaseUrl) update.apiBaseUrl = normalizeBostaBaseUrl(update.apiBaseUrl);
  if (update.apiKey === "" || update.apiKey === undefined) delete update.apiKey;

  if (
    update.deliveryDaysMin != null ||
    update.deliveryDaysMax != null ||
    update.deliveryDays != null
  ) {
    try {
      update.deliveryDays = resolveCarrierDeliveryDays(update, {
        required: existing.type !== "api",
      });
    } catch (error) {
      return next(new ApiError(error.message, 400));
    }
  }
  delete update.deliveryDaysMin;
  delete update.deliveryDaysMax;

  const carrier = await Carrier.findByIdAndUpdate(req.params.id, update, {
    returnDocument: "after",
    runValidators: true,
  }).select("+apiKey +apiBaseUrl");

  sendResponse(res, { message: "Carrier updated successfully", data: { carrier: mapCarrierForAdmin(carrier, []) } });
});

/**
 * @desc    Full Bosta sync — governorates, districts, mappings, carrier coverage
 * @route   POST /api/v1/admin/carriers/:id/bosta/sync-zones
 * @access  Admin
 */
export const syncBostaZonesForCarrier = asyncHandler(async (req, res) => {
  const ctx = await getBostaCarrierContext(req.params.id);

  const zoneStats = await syncBostaCarrierCoverage(ctx.carrier._id, ctx.credentials);
  sendResponse(res, { message: "Bosta governorates and districts synced successfully", data: zoneStats });
});

/**
 * @desc    Lightweight Bosta sync — updates bostaCovered only (no zones/mappings/coverage)
 * @route   POST /api/v1/admin/carriers/:id/bosta/sync-coverage
 * @access  Admin
 */
export const syncBostaCoverageForCarrier = asyncHandler(async (req, res, next) => {
  const ctx = await getBostaCarrierContext(req.params.id);

  const districtCount = await District.countDocuments();
  if (districtCount === 0) {
    return next(new ApiError("No districts in database. Run full Bosta zone sync first.", 400));
  }

  const stats = await syncBostaCoveredOnly(ctx.credentials);
  sendResponse(res, { message: "Bosta district coverage updated successfully", data: stats });
});

/**
 * @desc    Delete carrier (admin, not API type)
 * @route   DELETE /api/v1/admin/carriers/:id
 * @access  Admin
 */
export const deleteCarrier = asyncHandler(async (req, res, next) => {
  const carrier = await Carrier.findById(req.params.id);
  if (!carrier) return next(new ApiError(`No carrier found with id: ${req.params.id}`, 404));

  await CarrierCoverage.deleteMany({ carrier: req.params.id });
  await CarrierPickup.deleteMany({ carrier: req.params.id });
  await Carrier.findByIdAndDelete(req.params.id);

  sendResponse(res, { message: "Carrier deleted successfully" });
});

/**
 * @desc    Get carrier coverage rows (admin)
 * @route   GET /api/v1/admin/carriers/:id/coverage
 * @access  Admin
 */
export const getCarrierCoverage = asyncHandler(async (req, res, next) => {
  const carrier = await Carrier.findById(req.params.id);
  if (!carrier) return next(new ApiError(`No carrier found with id: ${req.params.id}`, 404));

  const coverage = await CarrierCoverage.find({ carrier: req.params.id }).populate("governorate", "name");

  sendResponse(res, { message: "Carrier coverage retrieved successfully", data: coverage });
});

/**
 * @desc    Replace carrier coverage for governorates (admin)
 * @route   PUT /api/v1/admin/carriers/:id/coverage
 * @access  Admin
 */
export const updateCarrierCoverage = asyncHandler(async (req, res, next) => {
  const { governorateIds = [] } = req.body;

  const carrier = await Carrier.findById(req.params.id);
  if (!carrier) return next(new ApiError(`No carrier found with id: ${req.params.id}`, 404));

  const govs = await Governorate.find({ _id: { $in: governorateIds } });
  if (govs.length !== governorateIds.length) {
    return next(new ApiError("One or more governorate IDs are invalid", 400));
  }

  await CarrierCoverage.deleteMany({ carrier: req.params.id });

  if (governorateIds.length > 0) {
    await CarrierCoverage.insertMany(
      governorateIds.map((govId) => ({ carrier: req.params.id, governorate: govId, isActive: true }))
    );
  }

  sendResponse(res, { message: "Coverage updated successfully", data: { count: governorateIds.length } });
});
