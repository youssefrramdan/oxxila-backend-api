// src/utils/carriers/bosta/admin.js
import { normalizeBostaBaseUrl } from '../bosta.js';
import { toPlainDoc } from '../../toPlainDoc.js';

export const mapCarrierForAdmin = (c, coverages) => ({
  ...toPlainDoc(c),
  hasApiKey: Boolean(c.apiKey),
  apiBaseUrl: c.apiBaseUrl ? normalizeBostaBaseUrl(c.apiBaseUrl) : null,
  apiKey: undefined,
  coverage: coverages
    .filter((cv) => cv.carrier.toString() === c._id.toString())
    .map((cv) => cv.governorate?.name)
    .filter(Boolean),
});
