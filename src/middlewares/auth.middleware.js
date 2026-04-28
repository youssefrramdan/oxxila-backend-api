// src/middlewares/auth.middleware.js
import jwt from 'jsonwebtoken';
import asyncHandler from 'express-async-handler';
import ApiError from '../utils/apiError.js';
import User from '../models/User.js';

/**
 * @desc    Protect routes — verify the Bearer token and attach the user to req.
 */
export const protectedRoutes = asyncHandler(async (req, res, next) => {
  const token = req.headers.authorization?.startsWith('Bearer ')
    ? req.headers.authorization.split(' ')[1]
    : null;

  if (!token) {
    return next(new ApiError('You are not logged in. Please log in to access this resource.', 401));
  }

  const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);

  const user = await User.findById(decoded.userId);
  if (!user) return next(new ApiError('The account linked to this token no longer exists', 401));
  if (!user.active) return next(new ApiError('This account has been deactivated', 403));
  if (user.changedPasswordAfter?.(decoded.iat)) {
    return next(new ApiError('Password was recently changed. Please log in again.', 401));
  }

  req.user = user;
  next();
});

/**
 * @desc    If a valid access token is present, attach `req.user` (same rules as protectedRoutes).
 *          Missing or invalid tokens continue without authentication.
 */
export const optionalAuth = asyncHandler(async (req, res, next) => {
  const token = req.headers.authorization?.startsWith('Bearer ')
    ? req.headers.authorization.split(' ')[1]
    : null;

  if (!token) return next();

  try {
    const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
    const user = await User.findById(decoded.userId);
    if (user?.active && !user.changedPasswordAfter?.(decoded.iat)) {
      req.user = user;
    }
  } catch {
    // Anonymous access
  }

  next();
});

/**
 * @desc    Allow only users whose role is in `roles`.
 */
export const allowTo = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return next(new ApiError('You do not have permission to perform this action', 403));
  }
  next();
};
