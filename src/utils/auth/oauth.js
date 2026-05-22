// src/utils/auth/oauth.js
import asyncHandler from 'express-async-handler';
import RefreshToken from '../../models/RefreshToken.js';
import { facebookOAuthEnabled } from '../../config/passport.js';
import {
  REFRESH_TTL_MS,
  generateAccessToken,
  generateRefreshToken,
  cookieOptions,
} from './tokens.js';

export const redirectFacebookNotConfigured = (res) => {
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

export const issueOAuthTokensAndRedirect = asyncHandler(async (req, res) => {
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
});

export { facebookOAuthEnabled };
