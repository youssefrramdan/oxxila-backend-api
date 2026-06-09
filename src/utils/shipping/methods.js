// src/utils/shipping/methods.js
import resolveShipping from '../resolveShipping.js';
import { DEFAULT_SHIPPING_METHOD } from './constants.js';

export const resolveShippingMethods = async ({ governorateId, districtId }) => {
  const { shippingPrice } = await resolveShipping({ governorateId, districtId });
  const methods = [
    {
      ...DEFAULT_SHIPPING_METHOD,
      price: shippingPrice,
    },
  ];
  return { methods, shippingPrice };
};

