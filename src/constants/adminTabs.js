// src/constants/adminTabs.js
/** Fixed admin permission tabs (sidebar / settings modules). */

export const ADMIN_TAB_KEYS = Object.freeze([
  'dashboard',
  'reports',
  'products',
  'categories',
  'brands',
  'subcategories',
  'orders',
  'customers',
  'reviews',
  'shipping',
  'returns',
  'faqs',
  'settings',
  'roles',
  'websiteContent',
]);

export const ADMIN_TAB_META = Object.freeze([
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'reports', label: 'Reports' },
  { key: 'products', label: 'Products' },
  { key: 'categories', label: 'Categories' },
  { key: 'brands', label: 'Brands' },
  { key: 'subcategories', label: 'Subcategories' },
  { key: 'orders', label: 'Orders' },
  { key: 'customers', label: 'Customers' },
  { key: 'reviews', label: 'Reviews' },
  { key: 'shipping', label: 'Shipping' },
  { key: 'returns', label: 'Returns' },
  { key: 'faqs', label: 'FAQs' },
  { key: 'settings', label: 'Settings' },
  { key: 'roles', label: 'Admin Roles' },
  { key: 'websiteContent', label: 'Website Content' },
]);

export const CRUD_ACTIONS = Object.freeze(['create', 'read', 'update', 'delete']);

export const emptyCrud = () => ({
  create: false,
  read: false,
  update: false,
  delete: false,
});

export const fullCrud = () => ({
  create: true,
  read: true,
  update: true,
  delete: true,
});

/** Full permissions object for every tab (used by super-admin seed). */
export const buildFullPermissions = () =>
  Object.fromEntries(ADMIN_TAB_KEYS.map((key) => [key, fullCrud()]));

/**
 * Normalize an incoming permissions payload:
 * - only known tabs
 * - every tab has boolean CRUD flags
 * - missing tabs default to all false
 */
export const normalizePermissions = (input = {}) => {
  const src =
    input instanceof Map ? Object.fromEntries(input.entries()) : input && typeof input === 'object' ? input : {};

  const out = {};
  for (const key of ADMIN_TAB_KEYS) {
    const row = src[key] && typeof src[key] === 'object' ? src[key] : {};
    out[key] = {
      create: Boolean(row.create),
      read: Boolean(row.read),
      update: Boolean(row.update),
      delete: Boolean(row.delete),
    };
  }
  return out;
};

export const SUPER_ADMIN_SLUG = 'super-admin';
export const SUPER_ADMIN_NAME = 'Super Admin';
