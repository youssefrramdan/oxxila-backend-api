// src/middlewares/validate.middleware.js
import { validationResult } from 'express-validator';
import ApiError from '../utils/apiError.js';

/**
 * Runs after an array of express-validator chains and rejects the request
 * with a 400 if any of them produced errors. Keep this middleware the last
 * entry in a route's validator array.
 */
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (errors.isEmpty()) return next();

  const message = errors
    .array({ onlyFirstError: true })
    .map((e) => e.msg)
    .join('. ');

  return next(new ApiError(message, 400));
};

export default validate;
