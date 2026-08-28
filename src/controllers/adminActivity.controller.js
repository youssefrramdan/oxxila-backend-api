// src/controllers/adminActivity.controller.js
import asyncHandler from 'express-async-handler';
import AdminActivityLog from '../models/AdminActivityLog.js';
import ApiFeatures from '../utils/apiFeatures.js';
import sendResponse from '../utils/apiResponse.js';

/**
 * @desc    List admin activity logs (Super Admin only)
 * @route   GET /api/v1/admin/activity-logs
 * @access  Super Admin
 */
export const listAdminActivityLogs = asyncHandler(async (req, res) => {
  const filter = {};

  if (req.query.actor) filter.actor = req.query.actor;
  if (req.query.tab) filter.tab = req.query.tab;
  if (req.query.action) filter.action = req.query.action;
  if (req.query.resourceType) filter.resourceType = req.query.resourceType;
  if (req.query.resourceId) filter.resourceId = String(req.query.resourceId);

  if (req.query.from || req.query.to) {
    filter.createdAt = {};
    if (req.query.from) filter.createdAt.$gte = new Date(req.query.from);
    if (req.query.to) filter.createdAt.$lte = new Date(`${req.query.to}T23:59:59.999`);
  }

  const features = new ApiFeatures(AdminActivityLog.find(filter), req.query)
    .search(['summary', 'resourceLabel', 'actorName', 'actorEmail'])
    .sort()
    .limitFields();

  await features.paginate();
  const logs = await features.mongooseQuery.lean();

  sendResponse(res, {
    message: 'Admin activity logs retrieved successfully',
    data: logs,
    pagination: features.getPaginationResult(),
  });
});
