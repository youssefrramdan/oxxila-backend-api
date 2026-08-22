// src/models/AdminRole.js
import mongoose from 'mongoose';
import slugify from 'slugify';
import {
  ADMIN_TAB_KEYS,
  SUPER_ADMIN_NAME,
  SUPER_ADMIN_SLUG,
  buildFullPermissions,
  normalizePermissions,
} from '../constants/adminTabs.js';

const crudSchema = new mongoose.Schema(
  {
    create: { type: Boolean, default: false },
    read: { type: Boolean, default: false },
    update: { type: Boolean, default: false },
    delete: { type: Boolean, default: false },
  },
  { _id: false }
);

const permissionsShape = Object.fromEntries(
  ADMIN_TAB_KEYS.map((key) => [key, { type: crudSchema, default: () => ({}) }])
);

const adminRoleSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Role name is required'],
      unique: true,
      trim: true,
      minlength: [2, 'Role name must be at least 2 characters'],
      maxlength: [80, 'Role name must be at most 80 characters'],
    },
    slug: {
      type: String,
      unique: true,
      lowercase: true,
      index: true,
    },
    description: {
      type: String,
      default: '',
      trim: true,
      maxlength: [500, 'Description must be at most 500 characters'],
    },
    /** System roles (e.g. super-admin) cannot be deleted or demoted. */
    isSystem: {
      type: Boolean,
      default: false,
    },
    permissions: {
      type: permissionsShape,
      default: () => normalizePermissions({}),
    },
  },
  { timestamps: true }
);

adminRoleSchema.pre('validate', function () {
  if (this.isModified('name') || !this.slug) {
    this.slug = slugify(this.name, { lower: true, strict: true });
  }
  this.permissions = normalizePermissions(this.permissions);
});

adminRoleSchema.pre('findOneAndUpdate', function () {
  const update = this.getUpdate() || {};
  const $set = update.$set || update;

  if (typeof $set.name === 'string' && $set.name.trim()) {
    $set.slug = slugify($set.name, { lower: true, strict: true });
  }
  if ($set.permissions !== undefined) {
    $set.permissions = normalizePermissions($set.permissions);
  }

  if (update.$set) update.$set = $set;
  else Object.assign(update, $set);
});

adminRoleSchema.methods.toPublic = function toPublic() {
  return {
    _id: this._id,
    name: this.name,
    slug: this.slug,
    description: this.description,
    isSystem: this.isSystem,
    permissions: normalizePermissions(this.permissions),
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

/**
 * Ensure the system Super Admin role exists with full permissions.
 * @returns {Promise<import('mongoose').Document>}
 */
adminRoleSchema.statics.ensureSuperAdmin = async function ensureSuperAdmin() {
  let role = await this.findOne({ slug: SUPER_ADMIN_SLUG });
  if (!role) {
    role = await this.create({
      name: SUPER_ADMIN_NAME,
      slug: SUPER_ADMIN_SLUG,
      description: 'Full access to all admin tabs and actions',
      isSystem: true,
      permissions: buildFullPermissions(),
    });
    return role;
  }

  // Keep system role fully privileged if someone stripped flags in DB.
  role.permissions = buildFullPermissions();
  role.isSystem = true;
  role.name = SUPER_ADMIN_NAME;
  await role.save();
  return role;
};

/**
 * Assign Super Admin role to any admin user missing adminRole.
 */
adminRoleSchema.statics.backfillAdminUsers = async function backfillAdminUsers() {
  const superAdmin = await this.ensureSuperAdmin();
  const result = await mongoose.model('User').updateMany(
    { role: 'admin', $or: [{ adminRole: null }, { adminRole: { $exists: false } }] },
    { $set: { adminRole: superAdmin._id } }
  );
  return { superAdminId: superAdmin._id, modifiedCount: result.modifiedCount ?? 0 };
};

const AdminRole = mongoose.model('AdminRole', adminRoleSchema);
export default AdminRole;
