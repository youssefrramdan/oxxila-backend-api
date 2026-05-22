// src/controllers/auth.controller.js
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import asyncHandler from 'express-async-handler';
import passport from 'passport';
import User from '../models/User.js';
import RefreshToken from '../models/RefreshToken.js';
import ApiError from '../utils/apiError.js';
import sendResponse from '../utils/apiResponse.js';
import sendEmail from '../utils/email.js';
import resetPasswordTemplate from '../utils/emailTemplates/resetPasswordTemplate.js';
import {
  REFRESH_TTL_MS,
  RESET_TOKEN_TTL_MIN,
  generateAccessToken,
  generateRefreshToken,
  cookieOptions,
  publicUser,
  sha256,
} from '../utils/auth/tokens.js';
import {
  facebookOAuthEnabled,
  redirectFacebookNotConfigured,
  issueOAuthTokensAndRedirect,
} from '../utils/auth/oauth.js';

export const register = asyncHandler(async (req, res, next) => {
  if (await User.findOne({ email: req.body.email })) {
    return next(new ApiError('Email already in use', 409));
  }
  const user = await User.create(req.body);
  sendResponse(res, {
    statusCode: 201,
    message: 'Registered successfully',
    data: { user: publicUser(user) },
  });
});

export const login = asyncHandler(async (req, res, next) => {
  const user = await User.findOne({ email: req.body.email }).select('+password');
  if (!user || !(await user.comparePassword(req.body.password))) {
    return next(new ApiError('Incorrect email or password', 401));
  }
  if (!user.active) {
    return next(new ApiError('Your account has been deactivated', 403));
  }

  const accessToken = generateAccessToken(user._id);
  const refreshToken = generateRefreshToken(user._id);

  await RefreshToken.create({
    token: refreshToken,
    userId: user._id,
    expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
  });

  res.cookie('refreshToken', refreshToken, cookieOptions);
  sendResponse(res, {
    message: 'Logged in successfully',
    data: { accessToken, user: publicUser(user) },
  });
});

export const refreshAccessToken = asyncHandler(async (req, res, next) => {
  const token = req.cookies?.refreshToken;
  if (!token) return next(new ApiError('No refresh token', 401));

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
  } catch {
    res.clearCookie('refreshToken', cookieOptions);
    return next(new ApiError('Invalid or expired refresh token', 403));
  }

  const stored = await RefreshToken.findOneAndDelete({ token });
  if (!stored) {
    res.clearCookie('refreshToken', cookieOptions);
    return next(new ApiError('Invalid refresh token', 403));
  }

  const accessToken = generateAccessToken(decoded.userId);
  const newRefreshToken = generateRefreshToken(decoded.userId);

  await RefreshToken.create({
    token: newRefreshToken,
    userId: decoded.userId,
    expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
  });

  res.cookie('refreshToken', newRefreshToken, cookieOptions);
  sendResponse(res, { message: 'Token refreshed', data: { accessToken } });
});

export const logout = asyncHandler(async (req, res) => {
  const token = req.cookies?.refreshToken;
  if (token) await RefreshToken.deleteOne({ token });
  res.clearCookie('refreshToken', cookieOptions);
  sendResponse(res, { message: 'Logged out successfully' });
});

export const me = asyncHandler(async (req, res) => {
  sendResponse(res, { data: publicUser(req.user) });
});

export const forgetPassword = asyncHandler(async (req, res) => {
  const genericResponse = {
    message: `If an account exists for this email, a reset link has been sent. The link will expire in ${RESET_TOKEN_TTL_MIN} minutes.`,
  };

  const user = await User.findOne({ email: req.body.email });
  if (!user) return sendResponse(res, genericResponse);

  const plainToken = crypto.randomBytes(32).toString('hex');
  user.passwordResetToken = sha256(plainToken);
  user.passwordResetExpires = Date.now() + RESET_TOKEN_TTL_MIN * 60 * 1000;
  await user.save({ validateBeforeSave: false });

  const base = (process.env.CLIENT_URL || 'http://localhost:3000').replace(/\/$/, '');
  const resetUrl = `${base}/reset-password/${plainToken}`;

  try {
    await sendEmail({
      email: user.email,
      subject: 'Reset your Oxxila password',
      html: resetPasswordTemplate(resetUrl, {
        name: user.name,
        expiresInMinutes: RESET_TOKEN_TTL_MIN,
      }),
    });
  } catch {
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save({ validateBeforeSave: false });
  }

  sendResponse(res, genericResponse);
});

export const verifyResetToken = asyncHandler(async (req, res, next) => {
  const user = await User.findOne({
    passwordResetToken: sha256(req.params.token),
    passwordResetExpires: { $gt: Date.now() },
  });

  if (!user) return next(new ApiError('Reset link is invalid or has expired', 400));

  sendResponse(res, { message: 'Reset token is valid' });
});

export const resetPassword = asyncHandler(async (req, res, next) => {
  const { newPassword, confirmPassword } = req.body;
  if (newPassword !== confirmPassword) {
    return next(new ApiError('Passwords do not match', 400));
  }

  const user = await User.findOne({
    passwordResetToken: sha256(req.params.token),
    passwordResetExpires: { $gt: Date.now() },
  }).select('+passwordResetToken +passwordResetExpires');

  if (!user) return next(new ApiError('Reset link is invalid or has expired', 400));

  user.password = newPassword;
  user.passwordResetToken = undefined;
  user.passwordResetExpires = undefined;
  await user.save();

  await RefreshToken.deleteMany({ userId: user._id });

  sendResponse(res, { message: 'Your password has been reset successfully' });
});

export const googleRedirect = passport.authenticate('google', {
  session: false,
  scope: ['profile', 'email'],
  prompt: 'select_account',
});

export const googleCallback = [
  passport.authenticate('google', {
    session: false,
    failureRedirect:
      process.env.OAUTH_FAILURE_REDIRECT || 'http://localhost:4200/login?error=google_failed',
  }),
  issueOAuthTokensAndRedirect,
];

export const facebookRedirect = (req, res, next) => {
  if (!facebookOAuthEnabled) {
    return redirectFacebookNotConfigured(res);
  }
  return passport.authenticate('facebook', {
    session: false,
    scope: ['public_profile'],
  })(req, res, next);
};

export const facebookCallback = [
  (req, res, next) => {
    if (!facebookOAuthEnabled) {
      return redirectFacebookNotConfigured(res);
    }
    next();
  },
  passport.authenticate('facebook', {
    session: false,
    failureRedirect:
      process.env.FACEBOOK_OAUTH_FAILURE_REDIRECT ||
      'http://localhost:4200/login?error=facebook_failed',
  }),
  issueOAuthTokensAndRedirect,
];
