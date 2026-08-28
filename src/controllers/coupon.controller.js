// src/controllers/coupon.controller.js
import asyncHandler from 'express-async-handler';
import Coupon from '../models/Coupon.js';
import ApiError from '../utils/apiError.js';
import sendResponse from '../utils/apiResponse.js';
import ApiFeatures from '../utils/apiFeatures.js';
import {
  attachAuditToDoc,
  logAdminCreate,
  logAdminDelete,
  logAdminUpdate,
  stampAuditFields,
} from '../utils/adminActivity.js';

/**
 * @desc    List coupons (admin)
 * @route   GET /api/v1/coupons
 * @access  Admin
 */
export const getCoupons = asyncHandler(async (req, res) => {
  const features = new ApiFeatures(Coupon.find(), req.query).filter().sort().limitFields();

  await features.paginate();

  const coupons = await features.mongooseQuery;
  const pagination = features.getPaginationResult();

  sendResponse(res, {
    message: 'Coupons retrieved successfully',
    data: coupons,
    pagination: { ...pagination, results: coupons.length },
  });
});

/**
 * @desc    Get one coupon
 * @route   GET /api/v1/coupons/:id
 * @access  Admin
 */
export const getCoupon = asyncHandler(async (req, res, next) => {
  const coupon = await Coupon.findById(req.params.id);
  if (!coupon) return next(new ApiError(`No coupon found with id: ${req.params.id}`, 404));

  sendResponse(res, { message: 'Coupon retrieved successfully', data: coupon });
});

/**
 * @desc    Create coupon
 * @route   POST /api/v1/coupons
 * @access  Admin
 */
export const createCoupon = asyncHandler(async (req, res) => {
  if (req.body.code) req.body.code = String(req.body.code).toUpperCase();
  stampAuditFields(req.body, req, { isCreate: true });

  const coupon = await Coupon.create(req.body);
  logAdminCreate(req, { tab: 'settings', resourceType: 'coupon', doc: coupon, labelKey: 'code' });
  sendResponse(res, {
    statusCode: 201,
    message: 'Coupon created successfully',
    data: attachAuditToDoc(coupon),
  });
});

/**
 * @desc    Update coupon
 * @route   PUT /api/v1/coupons/:id
 * @access  Admin
 */
export const updateCoupon = asyncHandler(async (req, res, next) => {
  if (req.body.code) req.body.code = String(req.body.code).toUpperCase();

  const previous = await Coupon.findById(req.params.id).lean();
  if (!previous) return next(new ApiError(`No coupon found with id: ${req.params.id}`, 404));

  stampAuditFields(req.body, req);
  const coupon = await Coupon.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  });

  logAdminUpdate(req, {
    tab: 'settings',
    resourceType: 'coupon',
    doc: coupon,
    previous,
    labelKey: 'code',
  });

  sendResponse(res, { message: 'Coupon updated successfully', data: attachAuditToDoc(coupon) });
});

/**
 * @desc    Delete coupon
 * @route   DELETE /api/v1/coupons/:id
 * @access  Admin
 */
export const deleteCoupon = asyncHandler(async (req, res, next) => {
  const coupon = await Coupon.findById(req.params.id);
  if (!coupon) return next(new ApiError(`No coupon found with id: ${req.params.id}`, 404));

  logAdminDelete(req, { tab: 'settings', resourceType: 'coupon', doc: coupon, labelKey: 'code' });
  await coupon.deleteOne();

  sendResponse(res, { message: 'Coupon deleted successfully' });
});

