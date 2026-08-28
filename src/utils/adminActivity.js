// src/utils/adminActivity.js
import AdminActivityLog from '../models/AdminActivityLog.js';
import User from '../models/User.js';
import logger from '../config/logger.js';

const auditUserSelect = 'name email';

/** Snapshot of the acting admin for inline audit blocks. */
export const buildAuditSnapshot = (user) => {
  if (!user?._id) return null;
  return {
    id: String(user._id),
    name: user.name?.trim() || 'Admin',
    email: user.email?.trim() || '',
  };
};

/** Stamp createdBy/updatedBy on a mongoose doc or plain write object. */
export const stampAuditFields = (target, req, { isCreate = false } = {}) => {
  const actorId = req?.user?._id;
  if (!actorId || !target) return target;

  if (isCreate && !target.createdBy) {
    target.createdBy = actorId;
  }
  target.updatedBy = actorId;
  return target;
};

const resolveAuditUser = (ref) => {
  if (!ref) return null;
  if (typeof ref === 'object' && ref._id) {
    return buildAuditSnapshot(ref);
  }
  return { id: String(ref), name: 'Admin', email: '' };
};

/** Build admin-facing audit block from a document with optional populated refs. */
export const buildAuditBlock = (doc) => {
  if (!doc) return null;

  const plain = doc?.toObject ? doc.toObject() : doc;
  const createdBy = resolveAuditUser(plain.createdBy);
  const updatedBy = resolveAuditUser(plain.updatedBy);
  const statusUpdatedBy = resolveAuditUser(plain.statusUpdatedBy);

  if (!createdBy && !updatedBy && !statusUpdatedBy && !plain.createdAt && !plain.updatedAt) {
    return null;
  }

  return {
    createdBy,
    updatedBy,
    statusUpdatedBy,
    createdAt: plain.createdAt ?? null,
    updatedAt: plain.updatedAt ?? null,
  };
};

/** Populate audit user refs on catalog/settings/shipping models. */
export const withAuditPopulate = (query) =>
  query.populate('createdBy', auditUserSelect).populate('updatedBy', auditUserSelect);

/** Orders track status changes via statusUpdatedBy (no updatedBy field). */
export const withOrderAuditPopulate = (query) =>
  query.populate('createdBy', auditUserSelect).populate('statusUpdatedBy', auditUserSelect);

/** Record an admin activity log entry (non-blocking). */
export const recordAdminActivity = (req, payload) => {
  const actor = req?.user;
  if (!actor?._id) return;

  void AdminActivityLog.create({
    actor: actor._id,
    actorName: actor.name?.trim() || 'Admin',
    actorEmail: actor.email?.trim() || '',
    tab: payload.tab,
    action: payload.action,
    resourceType: payload.resourceType,
    resourceId: String(payload.resourceId),
    resourceLabel: payload.resourceLabel?.trim() || '',
    summary: payload.summary?.trim() || `${payload.action} ${payload.resourceType}`,
    changes: payload.changes ?? null,
  }).catch((err) => {
    logger.error('Failed to record admin activity', { err: err.message, payload });
  });
};

/** Detect isActive toggle actions for cleaner summaries. */
export const resolveActiveToggleAction = (previousActive, nextActive) => {
  if (previousActive === nextActive) return 'update';
  if (nextActive === false) return 'hide';
  if (nextActive === true) return 'show';
  return 'update';
};

/** Build a simple field diff object for logging. */
export const buildFieldChange = (field, from, to) => {
  if (from === to) return null;
  return { [field]: { from, to } };
};

const resourceLabelFrom = (doc, labelKey = 'name') =>
  String(doc?.[labelKey] ?? doc?.code ?? doc?.title ?? doc?._id ?? '').trim();

/** Log a create mutation and stamp audit fields on req.body before Category.create etc. */
export const logAdminCreate = (
  req,
  { tab, resourceType, doc, labelKey = 'name', resourceLabel, summary },
) => {
  const label = resourceLabel ?? resourceLabelFrom(doc, labelKey);
  recordAdminActivity(req, {
    tab,
    action: 'create',
    resourceType,
    resourceId: doc._id,
    resourceLabel: label,
    summary: summary ?? `Created ${resourceType} "${label}"`,
  });
};

/** Log an update mutation; detects hide/show when isActive changes. */
export const logAdminUpdate = (
  req,
  { tab, resourceType, doc, previous, labelKey = 'name', resourceLabel, summary },
) => {
  const label =
    resourceLabel ?? (resourceLabelFrom(doc, labelKey) || resourceLabelFrom(previous, labelKey));
  let action = 'update';
  let changes = null;

  if (previous && doc && previous.isActive !== undefined && doc.isActive !== previous.isActive) {
    action = resolveActiveToggleAction(previous.isActive, doc.isActive);
    changes = buildFieldChange('isActive', previous.isActive, doc.isActive);
  }

  const verb =
    action === 'hide' ? 'Hidden' : action === 'show' ? 'Showed' : 'Updated';

  recordAdminActivity(req, {
    tab,
    action,
    resourceType,
    resourceId: doc._id,
    resourceLabel: label,
    summary: summary ?? `${verb} ${resourceType} "${label}"`,
    changes,
  });
};

/** Log a delete mutation. */
export const logAdminDelete = (req, { tab, resourceType, doc, labelKey = 'name' }) => {
  const label = resourceLabelFrom(doc, labelKey);
  recordAdminActivity(req, {
    tab,
    action: 'delete',
    resourceType,
    resourceId: doc._id,
    resourceLabel: label,
    summary: `Deleted ${resourceType} "${label}"`,
  });
};

/** Attach audit block to a single admin response document. */
export const attachAuditToDoc = (doc) => {
  if (!doc) return doc;
  const plain = doc?.toObject ? doc.toObject() : { ...doc };
  return { ...plain, audit: buildAuditBlock(plain) };
};

/** Batch-load audit users for list responses. */
export const enrichDocsWithAudit = async (docs) => {
  if (!docs?.length) return docs;

  const userIds = new Set();
  for (const doc of docs) {
    const plain = doc?.toObject ? doc.toObject() : doc;
    if (plain.createdBy) userIds.add(String(plain.createdBy));
    if (plain.updatedBy) userIds.add(String(plain.updatedBy));
    if (plain.statusUpdatedBy) userIds.add(String(plain.statusUpdatedBy));
  }

  if (!userIds.size) {
    return docs.map((doc) => {
      const plain = doc?.toObject ? doc.toObject() : { ...doc };
      return { ...plain, audit: buildAuditBlock(plain) };
    });
  }

  const users = await User.find({ _id: { $in: [...userIds] } }).select(auditUserSelect).lean();
  const userMap = new Map(users.map((u) => [String(u._id), u]));

  return docs.map((doc) => {
    const plain = doc?.toObject ? doc.toObject() : { ...doc };
    const withUsers = {
      ...plain,
      createdBy: plain.createdBy ? userMap.get(String(plain.createdBy)) ?? plain.createdBy : null,
      updatedBy: plain.updatedBy ? userMap.get(String(plain.updatedBy)) ?? plain.updatedBy : null,
      statusUpdatedBy: plain.statusUpdatedBy
        ? (userMap.get(String(plain.statusUpdatedBy)) ?? plain.statusUpdatedBy)
        : null,
    };
    return { ...withUsers, audit: buildAuditBlock(withUsers) };
  });
};
