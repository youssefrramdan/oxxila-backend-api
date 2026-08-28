// src/controllers/banner.controller.js
// Banner CRUD for homepage carousels
import asyncHandler from 'express-async-handler';
import Banner from '../models/Banner.js';
import Product from '../models/Product.js';
import Category from '../models/Category.js';
import ApiError from '../utils/apiError.js';
import sendResponse from '../utils/apiResponse.js';
import {
  attachAuditToDoc,
  logAdminCreate,
  logAdminDelete,
  logAdminUpdate,
  stampAuditFields,
} from '../utils/adminActivity.js';

/** Maps banner linkType to Mongoose model */
const MODEL_BY_LINK = { product: Product, category: Category };

/** Normalize a Mongoose doc or plain object to a plain object */
const lean = (doc) => (typeof doc?.toObject === 'function' ? doc.toObject() : doc);

/** Shape a banner for public list responses */
const toListItem = (doc) => {
  const o = lean(doc);
  const out = { id: String(o._id), image: o.image, linkType: o.linkType ?? 'none' };
  if (o.title) out.title = o.title;
  if (['product', 'category'].includes(o.linkType) && o.linkId) out.linkId = String(o.linkId);
  if (o.linkType === 'url' && o.externalUrl) out.externalUrl = o.externalUrl;
  return out;
};

/** Shape a banner for admin create/update responses */
const toAdminBanner = (doc) => ({
  ...toListItem(doc),
  isActive: lean(doc).isActive,
  createdAt: lean(doc).createdAt,
  updatedAt: lean(doc).updatedAt,
});

/** Validate product/category linkId exists when linkType requires it */
const checkLinkTarget = async (linkType, linkId, next) => {
  if (!['product', 'category'].includes(linkType)) return true;
  if (!linkId) { next(new ApiError('linkId is required for this link type', 400)); return false; }
  const Model = MODEL_BY_LINK[linkType];
  if (!(await Model.findById(linkId).select('_id').lean())) {
    next(new ApiError(`No ${linkType} found with id: ${linkId}`, 404));
    return false;
  }
  return true;
};

/** Apply allowed body fields onto a banner document in place */
const mergeBannerBody = (doc, body) => {
  for (const key of ['image', 'title', 'linkType', 'linkId', 'externalUrl', 'isActive']) {
    if (!(key in body)) continue;
    let v = body[key];
    if (['title', 'externalUrl', 'linkId'].includes(key) && (v === '' || v === 'null')) v = null;
    if (key === 'isActive') v = v === true || v === 'true';
    doc[key] = v;
  }
};

/**
 * @desc    List banners (public: active only; admin + includeInactive=true: all)
 * @route   GET /api/v1/banners
 * @access  Public (optional admin Bearer)
 */
export const getBanners = asyncHandler(async (req, res) => {
  const includeInactive =
    req.user?.role === 'admin' && String(req.query.includeInactive) === 'true';

  const filter = includeInactive ? {} : { isActive: true };
  const docs = await Banner.find(filter).sort({ createdAt: -1 }).lean();

  const data = includeInactive
    ? docs.map((d) => toAdminBanner(d))
    : docs.map((d) => toListItem(d));

  sendResponse(res, { message: 'Banners retrieved successfully', data: data || [] });
});

/**
 * @desc    Create banner
 * @route   POST /api/v1/banners
 * @access  Admin
 */
export const createBanner = asyncHandler(async (req, res, next) => {
  if (req.file?.path) req.body.image = req.file.path;
  const payload = { ...req.body, linkType: req.body.linkType ?? 'none' };
  if (!(await checkLinkTarget(payload.linkType, payload.linkId, next))) return;
  stampAuditFields(payload, req, { isCreate: true });
  const data = await Banner.create(payload);
  logAdminCreate(req, { tab: 'settings', resourceType: 'banner', doc: data, labelKey: 'title' });
  sendResponse(res, {
    statusCode: 201,
    message: 'Banner created successfully',
    data: attachAuditToDoc(toAdminBanner(data)),
  });
});

/**
 * @desc    Update banner
 * @route   PUT /api/v1/banners/:id
 * @access  Admin
 */
export const updateBanner = asyncHandler(async (req, res, next) => {
  const doc = await Banner.findById(req.params.id);
  if (!doc) return next(new ApiError(`No banner found with id: ${req.params.id}`, 404));
  const previous = doc.toObject();
  if (req.file?.path) req.body.image = req.file.path;

  mergeBannerBody(doc, req.body);

  if (!(await checkLinkTarget(doc.linkType, doc.linkId, next))) return;

  stampAuditFields(doc, req);
  await doc.save();
  logAdminUpdate(req, {
    tab: 'settings',
    resourceType: 'banner',
    doc,
    previous,
    labelKey: 'title',
  });
  sendResponse(res, {
    message: 'Banner updated successfully',
    data: attachAuditToDoc(toAdminBanner(doc)),
  });
});

/**
 * @desc    Delete banner
 * @route   DELETE /api/v1/banners/:id
 * @access  Admin
 */
export const deleteBanner = asyncHandler(async (req, res, next) => {
  const removed = await Banner.findById(req.params.id);
  if (!removed) return next(new ApiError(`No banner found with id: ${req.params.id}`, 404));

  logAdminDelete(req, { tab: 'settings', resourceType: 'banner', doc: removed, labelKey: 'title' });
  await removed.deleteOne();

  sendResponse(res, { message: 'Banner deleted successfully' });
});
