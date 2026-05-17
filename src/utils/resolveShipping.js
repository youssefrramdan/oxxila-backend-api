// src/utils/resolveShipping.js
import Governorate from '../models/Governorate.js';
import District from '../models/District.js';
import ApiError from './apiError.js';

/**
 * Resolves checkout shipping price from governorate + optional district.
 * Falls back to governorate price when district is missing, "other", or not covered.
 */
const resolveShipping = async ({ governorateId, districtId }) => {
  const governorate = await Governorate.findById(governorateId);
  if (!governorate || !governorate.isActive) {
    throw new ApiError('Governorate not found', 404);
  }

  if (!districtId || districtId === 'other') {
    return { shippingPrice: governorate.shippingPrice, isOther: true };
  }

  const district = await District.findById(districtId);
  if (!district || !district.isCovered) {
    return { shippingPrice: governorate.shippingPrice, isOther: true };
  }

  return { shippingPrice: district.shippingPrice, isOther: false };
};

export default resolveShipping;
