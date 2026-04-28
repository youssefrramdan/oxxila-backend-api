// src/controllers/auth.controller.js
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import asyncHandler from 'express-async-handler';
import passport from 'passport';
import { facebookOAuthEnabled } from '../config/passport.js';
import User from '../models/User.js';
import RefreshToken from '../models/RefreshToken.js';
import ApiError from '../utils/apiError.js';
import sendResponse from '../utils/apiResponse.js';
import sendEmail from '../utils/email.js';
import resetPasswordTemplate from '../utils/emailTemplates/resetPasswordTemplate.js';

// --- Helpers ---
const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const RESET_TOKEN_TTL_MIN = 60;

const generateAccessToken = (userId) =>
  jwt.sign({ userId }, process.env.JWT_ACCESS_SECRET, { expiresIn: '15m' });

const generateRefreshToken = (userId) =>
  jwt.sign({ userId }, process.env.JWT_REFRESH_SECRET, { expiresIn: '7d' });

const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  path: '/api/v1/auth',
  maxAge: REFRESH_TTL_MS,
};

/** When Facebook OAuth env vars are missing; reuse OAUTH_FAILURE_REDIRECT origin if set. */
const redirectFacebookNotConfigured = (res) => {
  const raw =
    process.env.OAUTH_FAILURE_REDIRECT || 'http://localhost:4200/login?error=google_failed';
  try {
    const u = new URL(raw);
    u.searchParams.set('error', 'facebook_not_configured');
    return res.redirect(u.toString());
  } catch {
    return res.redirect('http://localhost:4200/login?error=facebook_not_configured');
  }
};

const publicUser = (u) => ({ id: u._id, name: u.name, email: u.email, role: u.role });

const sha256 = (v) => crypto.createHash('sha256').update(v).digest('hex');

// --- Register ---
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

// --- Login ---
export const login = asyncHandler(async (req, res, next) => {
  const user = await User.findOne({ email: req.body.email }).select('+password');
  if (!user || !(await user.comparePassword(req.body.password))) {
    return next(new ApiError('Invalid email or password', 401));
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

// --- Refresh ---
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

  // Rotation: atomically remove the old row. If it wasn't there, reject.
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

// --- Logout ---
export const logout = asyncHandler(async (req, res) => {
  const token = req.cookies?.refreshToken;
  if (token) await RefreshToken.deleteOne({ token });
  res.clearCookie('refreshToken', cookieOptions);
  sendResponse(res, { message: 'Logged out successfully' });
});

// --- Me ---
export const me = asyncHandler(async (req, res) => {
  sendResponse(res, { data: publicUser(req.user) });
});

// --- Forgot password ---
export const forgetPassword = asyncHandler(async (req, res) => {
  // Always respond with the same generic message regardless of whether the
  // email exists, to prevent user enumeration attacks.
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
    // Still respond with the same generic message so attackers can't
    // distinguish delivery failures from non-existent accounts.
  }

  sendResponse(res, genericResponse);
});

/**
 * @desc    GET /api/v1/auth/reset-password/:token
 *          Lets the frontend validate the reset link before rendering
 *          the "set a new password" form.
 * @access  Public
 */
export const verifyResetToken = asyncHandler(async (req, res, next) => {
  const user = await User.findOne({
    passwordResetToken: sha256(req.params.token),
    passwordResetExpires: { $gt: Date.now() },
  });

  if (!user) return next(new ApiError('Reset link is invalid or has expired', 400));

  sendResponse(res, { message: 'Reset token is valid' });
});

/**
 * @desc    POST /api/v1/auth/reset-password/:token
 * @access  Public
 */
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

  // Log the user out of every device.
  await RefreshToken.deleteMany({ userId: user._id });

  sendResponse(res, { message: 'Your password has been reset successfully' });
});

// --- Google OAuth ---

// Step 1: redirect the browser to Google's consent screen.
// `prompt: 'select_account'` forces the account chooser; otherwise an active
// Google session skips straight through with the last-used account.
export const googleRedirect = passport.authenticate('google', {
  session: false,
  scope: ['profile', 'email'],
  prompt: 'select_account',
});

// Step 2: Google redirects back here. Passport has already resolved req.user
// via the GoogleStrategy verify callback. We issue our own JWT pair and
// redirect the browser to the Angular app with the access token in the hash
// so it never travels through the server logs.
export const googleCallback = [
  passport.authenticate('google', {
    session: false,
    failureRedirect:
      process.env.OAUTH_FAILURE_REDIRECT || 'http://localhost:4200/login?error=google_failed',
  }),
  asyncHandler(async (req, res) => {
    const accessToken = generateAccessToken(req.user._id);
    const refreshToken = generateRefreshToken(req.user._id);

    await RefreshToken.create({
      token: refreshToken,
      userId: req.user._id,
      expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
    });

    res.cookie('refreshToken', refreshToken, cookieOptions);

    const successUrl = process.env.OAUTH_SUCCESS_REDIRECT || 'http://localhost:4200/oauth/success';
    res.redirect(`${successUrl}#accessToken=${accessToken}`);
  }),
];

// --- Facebook OAuth ---

export const facebookRedirect = (req, res, next) => {
  if (!facebookOAuthEnabled) {
    return redirectFacebookNotConfigured(res);
  }
  // Only request permissions enabled for this app in Meta → App settings → Use cases
  // (e.g. "Authentication and account creation" → Permissions). Requesting `email`
  // before it is added there causes: "Invalid Scopes: email".
  // With `public_profile` only, Passport still creates users; missing email uses `fb_<id>@oauth.facebook`.
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
  asyncHandler(async (req, res) => {
    const accessToken = generateAccessToken(req.user._id);
    const refreshToken = generateRefreshToken(req.user._id);

    await RefreshToken.create({
      token: refreshToken,
      userId: req.user._id,
      expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
    });

    res.cookie('refreshToken', refreshToken, cookieOptions);

    const successUrl = process.env.OAUTH_SUCCESS_REDIRECT || 'http://localhost:4200/oauth/success';
    res.redirect(`${successUrl}#accessToken=${accessToken}`);
  }),
];
