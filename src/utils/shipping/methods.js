// src/utils/shipping/methods.js
import ApiError from '../apiError.js';
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

export const assertShippingMethodCode = (methodCode) => {
  const code = methodCode || DEFAULT_SHIPPING_METHOD.methodCode;
  if (code !== DEFAULT_SHIPPING_METHOD.methodCode) {
    throw new ApiError('Invalid shipping method', 400);
  }
  return code;
};
