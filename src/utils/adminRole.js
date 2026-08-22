// src/utils/adminRole.js
import AdminRole from '../models/AdminRole.js';
import { normalizePermissions, SUPER_ADMIN_SLUG } from '../constants/adminTabs.js';

const ROLE_SELECT = 'name slug description isSystem permissions';

/** Serialize adminRole for API responses. */
export const serializeAdminRole = (role) => {
  if (!role) return null;
  if (typeof role === 'string' || role._bsontype === 'ObjectId') {
    return { _id: role };
  }
  return {
    _id: role._id,
    name: role.name,
    slug: role.slug,
    description: role.description ?? '',
    isSystem: Boolean(role.isSystem),
    permissions: normalizePermissions(role.permissions),
    createdAt: role.createdAt,
    updatedAt: role.updatedAt,
  };
};

export const adminRolePopulate = {
  path: 'adminRole',
  select: ROLE_SELECT,
};

export const userHasPermission = (user, tab, action) => {
  if (!user || user.role !== 'admin') return false;
  const role = user.adminRole;
  if (!role || typeof role !== 'object') return false;
  if (role.slug === SUPER_ADMIN_SLUG || role.isSystem) return true;
  const perms = normalizePermissions(role.permissions);
  return Boolean(perms[tab]?.[action]);
};

export const findAdminRoleById = (id) => AdminRole.findById(id).select(ROLE_SELECT);

/** @param {import('mongoose').Types.ObjectId|string} roleId @param {typeof import('../models/User.js').default} User */
export const countAdminsWithRole = (roleId, User) =>
  User.countDocuments({ role: 'admin', adminRole: roleId });
