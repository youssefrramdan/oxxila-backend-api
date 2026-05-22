// src/utils/returns/parsing.js
import ApiError from '../apiError.js';
import { PROOF_REQUIRED_REASONS } from './constants.js';

export const parseReturnCreateBody = (req) => {
  const body = { ...req.body };

  if (typeof body.items === 'string') {
    try {
      body.items = JSON.parse(body.items);
    } catch {
      throw new ApiError('Invalid items JSON', 400);
    }
  }

  if (typeof body.pickupAddress === 'string') {
    try {
      body.pickupAddress = JSON.parse(body.pickupAddress);
    } catch {
      throw new ApiError('Invalid pickupAddress JSON', 400);
    }
  }

  return body;
};

export const getReturnProofUploads = (req) => {
  if (!req.files) return [];
  if (req.files.proofImages) {
    const files = req.files.proofImages;
    return Array.isArray(files) ? files : [files];
  }
  if (Array.isArray(req.files)) {
    return req.files.filter((f) => f.fieldname === 'proofImages');
  }
  return [];
};

export const collectProofImages = (req) => {
  return getReturnProofUploads(req).slice(0, 5).map((f) => ({
    url: f.path,
    publicId: f.filename || null,
  }));
};

export const assertProofForReason = (reason, proofImages) => {
  if (PROOF_REQUIRED_REASONS.has(reason) && (!proofImages || proofImages.length === 0)) {
    throw new ApiError('Proof images are required for this return reason', 400);
  }
};
