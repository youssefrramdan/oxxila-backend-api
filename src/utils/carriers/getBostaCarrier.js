// src/utils/carriers/getBostaCarrier.js
import Carrier from '../../models/Carrier.js';
import ApiError from '../apiError.js';

export const getBostaCarrier = async () => {
  const carrier = await Carrier.findOne({ apiProvider: 'bosta', isActive: true }).select(
    '+apiKey +apiBaseUrl'
  );

  if (!carrier?.apiKey || !carrier?.apiBaseUrl) {
    throw new ApiError('Bosta carrier is not configured or inactive', 404);
  }

  return { apiKey: carrier.apiKey, apiBaseUrl: carrier.apiBaseUrl };
};
