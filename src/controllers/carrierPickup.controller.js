// src/controllers/carrierPickup.controller.js
import asyncHandler from 'express-async-handler';
import Carrier from '../models/Carrier.js';
import CarrierPickup from '../models/CarrierPickup.js';
import ApiError from '../utils/apiError.js';
import sendResponse from '../utils/apiResponse.js';
import { getBostaCredentials } from '../utils/carriers/bostaCredentials.js';
import {
  createBostaPickupLocation,
  updateBostaPickupLocation,
  deleteBostaPickupLocation,
  setBostaDefaultPickupLocation,
  fetchBostaCityDistricts,
} from '../utils/carriers/bosta.js';

const assertBostaCarrier = async (carrierId, next) => {
  const carrier = await Carrier.findById(carrierId);
  if (!carrier) {
    next(new ApiError(`No carrier found with id: ${carrierId}`, 404));
    return null;
  }
  if (carrier.apiProvider !== 'bosta' || carrier.type !== 'api') {
    next(new ApiError('Pickups are only supported for Bosta API carriers', 400));
    return null;
  }
  return carrier;
};

const buildBostaPickupPayload = (body) => ({
  locationName: body.locationName,
  contacts: [
    {
      name: body.contactPerson.name,
      email: body.contactPerson.email || '',
      phone: body.contactPerson.phone,
    },
  ],
  address: {
    firstLine: body.address.firstLine,
    secondLine: body.address.secondLine || '',
    floor: body.address.floor || '0',
    apartment: body.address.apartment || '0',
    city: body.address.city,
    districtId: body.address.districtId,
    buildingType: body.address.buildingType ?? 0,
  },
});

/**
 * @desc    List carrier pickup locations
 * @route   GET /api/v1/admin/carriers/:id/pickups
 * @access  Admin
 */
export const getCarrierPickups = asyncHandler(async (req, res, next) => {
  const carrier = await assertBostaCarrier(req.params.id, next);
  if (!carrier) return;

  const pickups = await CarrierPickup.find({ carrier: req.params.id }).sort({
    isDefault: -1,
    createdAt: 1,
  });
  sendResponse(res, { message: 'Pickup locations retrieved successfully', data: pickups });
});

/**
 * @desc    Bosta cities/districts lookup for pickup forms
 * @route   GET /api/v1/admin/carriers/:id/bosta/districts-lookup
 * @access  Admin
 */
export const getBostaDistrictsLookup = asyncHandler(async (req, res, next) => {
  const carrier = await assertBostaCarrier(req.params.id, next);
  if (!carrier) return;

  const credentials = await getBostaCredentials(carrier);
  if (!credentials) {
    return next(new ApiError('Bosta API key is not configured', 400));
  }

  const cities = await fetchBostaCityDistricts(credentials);
  sendResponse(res, { message: 'Bosta districts retrieved successfully', data: cities });
});

/**
 * @desc    Create pickup (sync to Bosta)
 * @route   POST /api/v1/admin/carriers/:id/pickups
 * @access  Admin
 */
export const createCarrierPickup = asyncHandler(async (req, res, next) => {
  const carrier = await assertBostaCarrier(req.params.id, next);
  if (!carrier) return;

  const credentials = await getBostaCredentials(carrier);
  if (!credentials) {
    return next(new ApiError('Bosta API key is not configured', 400));
  }

  const bostaPayload = buildBostaPickupPayload(req.body);
  const bostaRes = await createBostaPickupLocation(bostaPayload, credentials);
  const bostaLoc = bostaRes.data ?? bostaRes;
  const bostaLocationId = bostaLoc._id ?? bostaLoc.id;

  const isDefault =
    req.body.isDefault === true ||
    (await CarrierPickup.countDocuments({ carrier: req.params.id })) === 0;

  const pickup = await CarrierPickup.create({
    carrier: req.params.id,
    locationName: req.body.locationName,
    contactPerson: req.body.contactPerson,
    address: req.body.address,
    bostaLocationId,
    isDefault,
  });

  if (isDefault && bostaLocationId) {
    await setBostaDefaultPickupLocation(bostaLocationId, credentials);
  }

  sendResponse(res, {
    statusCode: 201,
    message: 'Pickup location created successfully',
    data: pickup,
  });
});

/**
 * @desc    Update pickup
 * @route   PUT /api/v1/admin/carriers/:id/pickups/:pickupId
 * @access  Admin
 */
export const updateCarrierPickup = asyncHandler(async (req, res, next) => {
  const carrier = await assertBostaCarrier(req.params.id, next);
  if (!carrier) return;

  const pickup = await CarrierPickup.findOne({
    _id: req.params.pickupId,
    carrier: req.params.id,
  });
  if (!pickup) {
    return next(new ApiError(`No pickup found with id: ${req.params.pickupId}`, 404));
  }

  const credentials = await getBostaCredentials(carrier);
  if (pickup.bostaLocationId && credentials && req.body.address) {
    await updateBostaPickupLocation(
      pickup.bostaLocationId,
      buildBostaPickupPayload({ ...req.body, contactPerson: req.body.contactPerson ?? pickup.contactPerson }),
      credentials
    );
  }

  Object.assign(pickup, {
    ...(req.body.locationName && { locationName: req.body.locationName }),
    ...(req.body.contactPerson && { contactPerson: req.body.contactPerson }),
    ...(req.body.address && { address: req.body.address }),
    ...(req.body.isDefault !== undefined && { isDefault: req.body.isDefault }),
  });
  await pickup.save();

  if (pickup.isDefault && pickup.bostaLocationId && credentials) {
    await setBostaDefaultPickupLocation(pickup.bostaLocationId, credentials);
  }

  sendResponse(res, { message: 'Pickup location updated successfully', data: pickup });
});

/**
 * @desc    Delete pickup
 * @route   DELETE /api/v1/admin/carriers/:id/pickups/:pickupId
 * @access  Admin
 */
export const deleteCarrierPickup = asyncHandler(async (req, res, next) => {
  const carrier = await assertBostaCarrier(req.params.id, next);
  if (!carrier) return;

  const pickup = await CarrierPickup.findOne({
    _id: req.params.pickupId,
    carrier: req.params.id,
  });
  if (!pickup) {
    return next(new ApiError(`No pickup found with id: ${req.params.pickupId}`, 404));
  }

  const credentials = await getBostaCredentials(carrier);
  if (pickup.bostaLocationId && credentials) {
    try {
      await deleteBostaPickupLocation(pickup.bostaLocationId, credentials);
    } catch {
      // Bosta may block delete on original location — still remove locally
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
  const carrier = await assertBostaCarrier(req.params.id, next);
  if (!carrier) return;

  const pickup = await CarrierPickup.findOne({
    _id: req.params.pickupId,
    carrier: req.params.id,
  });
  if (!pickup) {
    return next(new ApiError(`No pickup found with id: ${req.params.pickupId}`, 404));
  }

  const credentials = await getBostaCredentials(carrier);
  if (pickup.bostaLocationId && credentials) {
    await setBostaDefaultPickupLocation(pickup.bostaLocationId, credentials);
  }

  pickup.isDefault = true;
  await pickup.save();

  sendResponse(res, { message: 'Default pickup location updated successfully', data: pickup });
});
