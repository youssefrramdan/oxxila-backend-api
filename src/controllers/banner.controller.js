// src/controllers/banner.controller.js
import asyncHandler from 'express-async-handler';
import Banner from '../models/Banner.js';
import Product from '../models/Product.js';
import Category from '../models/Category.js';
import ApiError from '../utils/apiError.js';
import sendResponse from '../utils/apiResponse.js';

const MODEL_BY_LINK = { product: Product, category: Category };

const lean = (doc) => (typeof doc?.toObject === 'function' ? doc.toObject() : doc);

const toListItem = (doc) => {
  const o = lean(doc);
  const out = { id: String(o._id), image: o.image, linkType: o.linkType ?? 'none' };
  if (o.title) out.title = o.title;
  if (['product', 'category'].includes(o.linkType) && o.linkId) out.linkId = String(o.linkId);
  if (o.linkType === 'url' && o.externalUrl) out.externalUrl = o.externalUrl;
  return out;
};

const toAdminBanner = (doc) => ({
  ...toListItem(doc),
  isActive: lean(doc).isActive,
  createdAt: lean(doc).createdAt,
  updatedAt: lean(doc).updatedAt,
});

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

const mergeBannerBody = (doc, body) => {
  for (const key of ['image', 'title', 'linkType', 'linkId', 'externalUrl', 'isActive']) {
    if (!(key in body)) continue;
    let v = body[key];
    if (['title', 'externalUrl', 'linkId'].includes(key) && (v === '' || v === 'null')) v = null;
    if (key === 'isActive') v = v === true || v === 'true';
    doc[key] = v;
  }
};

// GET /api/v1/banners — Public
export const getBanners = asyncHandler(async (req, res) => {
  const docs = await Banner.find({ isActive: true }).sort({ createdAt: -1 }).lean();
  sendResponse(res, { message: 'Banners retrieved successfully', data: docs.map(toListItem) || [] });
});

// POST /api/v1/banners — Admin
export const createBanner = asyncHandler(async (req, res, next) => {
  if (req.file?.path) req.body.image = req.file.path;
  const payload = { ...req.body, linkType: req.body.linkType ?? 'none' };
  if (!(await checkLinkTarget(payload.linkType, payload.linkId, next))) return;
  const data = await Banner.create(payload);
  sendResponse(res, { statusCode: 201, message: 'Banner created successfully', data: toAdminBanner(data) });
});

// PUT /api/v1/banners/:id — Admin
export const updateBanner = asyncHandler(async (req, res, next) => {
  const doc = await Banner.findById(req.params.id);
  if (!doc) return next(new ApiError(`No banner found with id: ${req.params.id}`, 404));
  if (req.file?.path) req.body.image = req.file.path;

  mergeBannerBody(doc, req.body);

  if (!(await checkLinkTarget(doc.linkType, doc.linkId, next))) return;

  await doc.save();
  sendResponse(res, { message: 'Banner updated successfully', data: toAdminBanner(doc) });
});

// DELETE /api/v1/banners/:id — Admin
export const deleteBanner = asyncHandler(async (req, res, next) => {
  const removed = await Banner.findOneAndDelete({ _id: req.params.id });
  if (!removed) return next(new ApiError(`No banner found with id: ${req.params.id}`, 404));

  sendResponse(res, { message: 'Banner deleted successfully' });
});
