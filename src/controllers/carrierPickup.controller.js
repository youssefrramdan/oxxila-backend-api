// src/controllers/carrierPickup.controller.js
import asyncHandler from 'express-async-handler';
import Carrier from '../models/Carrier.js';
import CarrierPickup from '../models/CarrierPickup.js';
import ApiError from '../utils/apiError.js';
import sendResponse from '../utils/apiResponse.js';
import { getBostaCredentials } from '../utils/carriers/bostaCredentials.js';
import {
  buildPickupLocationPayload,
  createBostaPickupLocation,
  deleteBostaPickupLocation,
  setBostaDefaultPickupLocation,
  extractBostaLocationId,
  fetchBostaDistricts,
  listPickupsFromDb,
  syncPickupsToDb,
} from '../utils/carriers/bostaPickup.js';

const requireBostaCarrier = async (carrierId, next) => {
  const carrier = await Carrier.findById(carrierId);
  if (!carrier) {
    next(new ApiError(`No carrier found with id: ${carrierId}`, 404));
    return null;
  }
  if (carrier.apiProvider !== 'bosta' || carrier.type !== 'api') {
    next(new ApiError('Pickups are only supported for Bosta API carriers', 400));
    return null;
  }
  const credentials = await getBostaCredentials(carrier);
  if (!credentials) {
    next(new ApiError('Bosta API key is not configured', 400));
    return null;
  }
  return { carrier, credentials };
};

const findPickup = async (carrierId, pickupId, next) => {
  const pickup = await CarrierPickup.findOne({ _id: pickupId, carrier: carrierId });
  if (!pickup) {
    next(new ApiError(`No pickup found with id: ${pickupId}`, 404));
    return null;
  }
  return pickup;
};

const bostaApiError = (err, fallback) =>
  new ApiError(err.message || fallback, err.statusCode || 502);

/**
 * @desc    List carrier pickup locations (syncs from Bosta when DB is empty)
 * @route   GET /api/v1/admin/carriers/:id/pickups
 * @access  Admin
 */
export const getCarrierPickups = asyncHandler(async (req, res, next) => {
  const ctx = await requireBostaCarrier(req.params.id, next);
  if (!ctx) return;

  let pickups = await listPickupsFromDb(ctx.carrier._id);
  if (!pickups.length) {
    try {
      await syncPickupsToDb(ctx.carrier._id, ctx.credentials);
      pickups = await listPickupsFromDb(ctx.carrier._id);
    } catch {
      /* keep empty */
    }
  }

  sendResponse(res, { message: 'Pickup locations retrieved successfully', data: pickups });
});

/**
 * @desc    Bosta cities/districts for pickup form
 * @route   GET /api/v1/admin/carriers/:id/bosta/districts-lookup
 * @access  Admin
 */
export const getBostaDistrictsLookup = asyncHandler(async (req, res, next) => {
  const ctx = await requireBostaCarrier(req.params.id, next);
  if (!ctx) return;

  const cities = await fetchBostaDistricts(ctx.credentials);
  sendResponse(res, { message: 'Bosta districts retrieved successfully', data: cities });
});

/**
 * @desc    Create pickup on Bosta and store locally
 * @route   POST /api/v1/admin/carriers/:id/pickups
 * @access  Admin
 */
export const createCarrierPickup = asyncHandler(async (req, res, next) => {
  const ctx = await requireBostaCarrier(req.params.id, next);
  if (!ctx) return;

  let bostaRes;
  try {
    bostaRes = await createBostaPickupLocation(
      buildPickupLocationPayload(req.body),
      ctx.credentials
    );
  } catch (err) {
    return next(bostaApiError(err, 'Bosta pickup location creation failed'));
  }

  const bostaLocationId = extractBostaLocationId(bostaRes);
  const isDefault =
    req.body.isDefault === true ||
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
  }

  sendResponse(res, {
    statusCode: 201,
    message: 'Pickup location created successfully',
    data: pickup,
  });
});

/**
 * @desc    Delete pickup
 * @route   DELETE /api/v1/admin/carriers/:id/pickups/:pickupId
 * @access  Admin
 */
export const deleteCarrierPickup = asyncHandler(async (req, res, next) => {
  const ctx = await requireBostaCarrier(req.params.id, next);
  if (!ctx) return;

  const pickup = await findPickup(ctx.carrier._id, req.params.pickupId, next);
  if (!pickup) return;

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
export const setDefaultCarrierPickup = asyncHandler(async (req, res, next) => {
  const ctx = await requireBostaCarrier(req.params.id, next);
  if (!ctx) return;

  const pickup = await findPickup(ctx.carrier._id, req.params.pickupId, next);
  if (!pickup) return;

  if (pickup.bostaLocationId) {
    try {
      await setBostaDefaultPickupLocation(pickup.bostaLocationId, ctx.credentials);
    } catch (err) {
      return next(bostaApiError(err, 'Could not set default pickup on Bosta'));
    }
  }

  pickup.isDefault = true;
  await pickup.save();

  sendResponse(res, { message: 'Default pickup location updated successfully', data: pickup });
});
