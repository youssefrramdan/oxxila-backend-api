// src/controllers/carrier.controller.js
import asyncHandler from "express-async-handler";
import Carrier from "../models/Carrier.js";
import CarrierCoverage from "../models/CarrierCoverage.js";
import CarrierPickup from "../models/CarrierPickup.js";
import Governorate from "../models/Governorate.js";
import ApiError from "../utils/apiError.js";
import sendResponse from "../utils/apiResponse.js";
import {
  normalizeBostaBaseUrl,
  getBostaCredentials,
} from "../utils/carriers/bosta.js";
import { syncBostaCarrierCoverage } from "../utils/carriers/bostaFulfillment.js";
import { mapCarrierForAdmin } from "../utils/carriers/bosta/admin.js";

const MAX_PICKUP_LOCATIONS = 200;

/**
 * @desc    List carriers with coverage summary (admin)
 * @route   GET /api/v1/admin/carriers
 * @access  Admin
 */
export const getCarriers = asyncHandler(async (req, res) => {
  const carriers = await Carrier.find()
    .select("+apiKey +apiBaseUrl")
    .sort({ name: 1 });

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
  const {
    name,
    code,
    type,
    deliveryDays,
    logo,
    apiProvider,
    apiKey,
    apiBaseUrl,
  } = req.body;

  const exists = await Carrier.findOne({ code: code.toUpperCase() });
  if (exists) return next(new ApiError("Carrier code already exists", 400));

  const carrier = await Carrier.create({
    name,
    code,
    type,
    deliveryDays,
    logo,
    ...(type === "api"
      ? {
          apiProvider,
          apiKey,
          apiBaseUrl: apiBaseUrl ? normalizeBostaBaseUrl(apiBaseUrl) : null,
        }
      : {}),
  });

  sendResponse(res, {
    statusCode: 201,
    message: "Carrier created successfully",
    data: { carrier },
  });
});

/**
 * @desc    Update carrier (admin)
 * @route   PUT /api/v1/admin/carriers/:id
 * @access  Admin
 */
export const updateCarrier = asyncHandler(async (req, res, next) => {
  delete req.body.type;
  delete req.body.apiProvider;

  const existing = await Carrier.findById(req.params.id).select(
    "+apiKey +apiBaseUrl",
  );
  if (!existing)
    return next(
      new ApiError(`No carrier found with id: ${req.params.id}`, 404),
    );

  const update = { ...req.body };
  if (update.apiBaseUrl) {
    update.apiBaseUrl = normalizeBostaBaseUrl(update.apiBaseUrl);
  }
  if (update.apiKey === "" || update.apiKey === undefined) {
    delete update.apiKey;
  }

  const carrier = await Carrier.findByIdAndUpdate(req.params.id, update, {
    returnDocument: "after",
    runValidators: true,
  }).select("+apiKey +apiBaseUrl");

  sendResponse(res, {
    message: "Carrier updated successfully",
    data: { carrier: mapCarrierForAdmin(carrier, []) },
  });
});

/**
 * @desc    Sync Bosta zones and coverage manually
 * @route   POST /api/v1/admin/carriers/:id/bosta/sync-zones
 * @access  Admin
 */
export const syncBostaZonesForCarrier = asyncHandler(async (req, res, next) => {
  const carrier = await Carrier.findById(req.params.id).select(
    "+apiKey +apiBaseUrl",
  );
  if (!carrier)
    return next(
      new ApiError(`No carrier found with id: ${req.params.id}`, 404),
    );
  if (carrier.apiProvider !== "bosta") {
    return next(new ApiError("Carrier is not a Bosta API carrier", 400));
  }

  const credentials = await getBostaCredentials(carrier);
  if (!credentials) {
    return next(new ApiError("Bosta API key is not configured", 400));
  }

  const zoneStats = await syncBostaCarrierCoverage(carrier._id, credentials);
  sendResponse(res, {
    message: "Bosta governorates and districts synced successfully",
    data: zoneStats,
  });
});

/**
 * @desc    Delete carrier (admin, not API type)
 * @route   DELETE /api/v1/admin/carriers/:id
 * @access  Admin
 */
export const deleteCarrier = asyncHandler(async (req, res, next) => {
  const carrier = await Carrier.findById(req.params.id);
  if (!carrier)
    return next(
      new ApiError(`No carrier found with id: ${req.params.id}`, 404),
    );

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
  if (!carrier)
    return next(
      new ApiError(`No carrier found with id: ${req.params.id}`, 404),
    );

  const coverage = await CarrierCoverage.find({
    carrier: req.params.id,
  }).populate("governorate", "name");

  sendResponse(res, {
    message: "Carrier coverage retrieved successfully",
    data: coverage,
  });
});

/**
 * @desc    Replace carrier coverage for governorates (admin)
 * @route   PUT /api/v1/admin/carriers/:id/coverage
 * @access  Admin
 */
export const updateCarrierCoverage = asyncHandler(async (req, res, next) => {
  const { governorateIds = [] } = req.body;

  const carrier = await Carrier.findById(req.params.id);
  if (!carrier)
    return next(
      new ApiError(`No carrier found with id: ${req.params.id}`, 404),
    );

  const govs = await Governorate.find({ _id: { $in: governorateIds } });
  if (govs.length !== governorateIds.length) {
    return next(new ApiError("One or more governorate IDs are invalid", 400));
  }

  await CarrierCoverage.deleteMany({ carrier: req.params.id });

  if (governorateIds.length > 0) {
    await CarrierCoverage.insertMany(
      governorateIds.map((govId) => ({
        carrier: req.params.id,
        governorate: govId,
        isActive: true,
      })),
    );
  }

  sendResponse(res, {
    message: "Coverage updated successfully",
    data: { count: governorateIds.length },
  });
});

export const getBostaPickupLocations = asyncHandler(async (req, res) => {
  const bostaCarriers = await Carrier.find({
    apiProvider: "bosta",
    type: "api",
    isActive: true,
  }).select("_id name");

  const pickups = await CarrierPickup.find({
    carrier: { $in: bostaCarriers.map((c) => c._id) },
  })
    .select("carrier locationName bostaLocationId isDefault address")
    .populate("carrier", "name")
    .sort({ isDefault: -1, locationName: 1 })
    .limit(MAX_PICKUP_LOCATIONS)
    .lean();

  sendResponse(res, {
    message: "Bosta pickup locations retrieved successfully",
    data: pickups,
  });
});
