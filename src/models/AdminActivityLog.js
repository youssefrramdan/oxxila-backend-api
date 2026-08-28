// src/models/AdminActivityLog.js
import mongoose from 'mongoose';
import { ADMIN_TAB_KEYS } from '../constants/adminTabs.js';

const ADMIN_ACTIONS = [
  'create',
  'update',
  'delete',
  'hide',
  'show',
  'assign',
  'refund',
  'cancel',
  'sync',
  'activate',
  'deactivate',
];

const adminActivityLogSchema = new mongoose.Schema(
  {
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    actorName: { type: String, trim: true, default: '' },
    actorEmail: { type: String, trim: true, default: '' },
    tab: { type: String, enum: ADMIN_TAB_KEYS, required: true },
    action: { type: String, enum: ADMIN_ACTIONS, required: true },
    resourceType: { type: String, required: true, trim: true, index: true },
    resourceId: { type: String, required: true, trim: true, index: true },
    resourceLabel: { type: String, trim: true, default: '' },
    summary: { type: String, trim: true, required: true },
    changes: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

adminActivityLogSchema.index({ createdAt: -1 });
adminActivityLogSchema.index({ actor: 1, createdAt: -1 });
adminActivityLogSchema.index({ resourceType: 1, resourceId: 1, createdAt: -1 });

const AdminActivityLog = mongoose.model('AdminActivityLog', adminActivityLogSchema);
export default AdminActivityLog;
