// src/utils/returns/logistics.js
import mongoose from 'mongoose';
import Carrier from '../../models/Carrier.js';
import CarrierPickup from '../../models/CarrierPickup.js';
import ApiError from '../apiError.js';

export const resolveLogisticsOnApprove = async (extras) => {
  const { logisticsHandler, carrierId, dropOffPickupId } = extras;

  if (!logisticsHandler || !['bosta', 'internal'].includes(logisticsHandler)) {
    throw new ApiError('logisticsHandler must be bosta or internal when approving', 400);
  }

  if (logisticsHandler === 'internal') {
    return { logisticsHandler: 'internal', carrier: null, dropOffPickup: null, dropOffSnapshot: null };
  }

  if (!carrierId || !mongoose.Types.ObjectId.isValid(carrierId)) {
    throw new ApiError('carrierId is required when logisticsHandler is bosta', 400);
  }

  if (!dropOffPickupId || !mongoose.Types.ObjectId.isValid(dropOffPickupId)) {
    throw new ApiError('dropOffPickupId is required when logisticsHandler is bosta', 400);
  }

  const carrier = await Carrier.findById(carrierId);
  if (!carrier?.isActive || carrier.apiProvider !== 'bosta' || carrier.type !== 'api') {
    throw new ApiError('Invalid Bosta carrier for return drop-off', 400);
  }

  const pickup = await CarrierPickup.findOne({ _id: dropOffPickupId, carrier: carrier._id });
  if (!pickup) {
    throw new ApiError('Drop-off pickup location not found for this carrier', 404);
  }

  return {
    logisticsHandler: 'bosta',
    carrier: carrier._id,
    dropOffPickup: pickup._id,
    dropOffSnapshot: {
      locationName: pickup.locationName,
      bostaLocationId: pickup.bostaLocationId,
      address: pickup.address,
    },
  };
};
