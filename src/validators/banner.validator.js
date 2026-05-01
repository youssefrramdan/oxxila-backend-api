// src/validators/banner.validator.js
import { body, param } from 'express-validator';
import validate from '../middlewares/validate.middleware.js';

const mongoId = (p) => param(p).isMongoId().withMessage(`Invalid ${p}`);

const requireImage = body().custom((_, { req }) => {
  if (req.file?.path || (typeof req.body.image === 'string' && req.body.image.trim())) return true;
  throw new Error('Image is required');
});

export const createBannerValidator = [requireImage, validate];

export const updateBannerValidator = [mongoId('id'), validate];

export const bannerIdParamValidator = [mongoId('id'), validate];
