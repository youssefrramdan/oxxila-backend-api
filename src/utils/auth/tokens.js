// src/utils/auth/tokens.js
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { normalizePermissions } from '../../constants/adminTabs.js';

export const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const RESET_TOKEN_TTL_MIN = 60;

export const generateAccessToken = (userId) =>
  jwt.sign({ userId }, process.env.JWT_ACCESS_SECRET, { expiresIn: '15m' });

export const generateRefreshToken = (userId) =>
  jwt.sign({ userId }, process.env.JWT_REFRESH_SECRET, { expiresIn: '7d' });

export const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  path: '/api/v1/auth',
  maxAge: REFRESH_TTL_MS,
};

export const publicUser = (u) => {
  const base = {
    id: u._id,
    name: u.name,
    email: u.email,
    role: u.role,
  };
  if (u.role !== 'admin') return base;

  let adminRole = null;
  if (u.adminRole && typeof u.adminRole === 'object' && u.adminRole.name) {
    adminRole = {
      _id: u.adminRole._id,
      name: u.adminRole.name,
      slug: u.adminRole.slug,
      description: u.adminRole.description ?? '',
      isSystem: Boolean(u.adminRole.isSystem),
      permissions: normalizePermissions(u.adminRole.permissions),
    };
  } else if (u.adminRole) {
    adminRole = { _id: u.adminRole };
  }

  return { ...base, adminRole };
};

export const sha256 = (v) => crypto.createHash('sha256').update(v).digest('hex');
