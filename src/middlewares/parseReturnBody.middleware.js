// src/middlewares/parseReturnBody.middleware.js
import ApiError from '../utils/apiError.js';

/** Normalize multipart JSON fields before express-validator runs. */
export const parseReturnBody = (req, _res, next) => {
  try {
    if (Array.isArray(req.body.order)) {
      req.body.order = req.body.order[0];
    }
    if (typeof req.body.order === 'string') {
      req.body.order = req.body.order.trim();
    }
    if (typeof req.body.items === 'string') {
      req.body.items = JSON.parse(req.body.items);
    }
    if (typeof req.body.pickupAddress === 'string') {
      req.body.pickupAddress = JSON.parse(req.body.pickupAddress);
    }
    if (!Array.isArray(req.body.items)) {
      req.body.items = [];
    }
  } catch {
    return next(new ApiError('Invalid JSON in items or pickupAddress', 400));
  }
  next();
};
