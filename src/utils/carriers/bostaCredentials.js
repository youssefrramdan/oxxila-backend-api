// src/utils/carriers/bostaCredentials.js
import Carrier from '../../models/Carrier.js';

export const normalizeBostaBaseUrl = (apiBaseUrl) => {
  let base = String(apiBaseUrl || 'https://app.bosta.co').trim();
  if (!base) base = 'https://app.bosta.co';
  base = base.replace(/\/+$/, '');
  base = base.replace(/\/api\/v2$/i, '');
  return base;
};

export const getBostaCredentials = async (carrierOrId) => {
  const id = carrierOrId?._id ?? carrierOrId;
  const carrier = await Carrier.findById(id).select('+apiKey +apiBaseUrl');
  if (!carrier) return null;
  if (carrier.apiProvider !== 'bosta' || carrier.type !== 'api') return null;

  const apiKey = carrier.apiKey?.trim();
  if (!apiKey) return null;

  return {
    apiKey,
    apiBaseUrl: normalizeBostaBaseUrl(carrier.apiBaseUrl),
  };
};
