// src/controllers/contentPage.controller.js
import asyncHandler from 'express-async-handler';
import ContentPage, { CONTENT_PAGE_SLUGS } from '../models/ContentPage.js';
import ApiError from '../utils/apiError.js';
import sendResponse from '../utils/apiResponse.js';
import { recordAdminActivity } from '../utils/adminActivity.js';

const normalizeItems = (items) => {
  if (!Array.isArray(items)) return [];
  return items.map((item) => ({
    title: String(item?.title ?? '').trim(),
    description: String(item?.description ?? '').trim(),
  }));
};

const toPublicSection = (section) => ({
  key: section.key,
  title: section.title ?? '',
  subtitle: section.subtitle ?? '',
  body: section.body ?? '',
  items: (section.items ?? []).map((item) => ({
    title: item.title ?? '',
    description: item.description ?? '',
  })),
  buttonLabel: section.buttonLabel ?? '',
});

const toPublicPage = (doc) => {
  const plain = typeof doc.toObject === 'function' ? doc.toObject() : doc;
  return {
    slug: plain.slug,
    title: plain.title ?? '',
    subtitle: plain.subtitle ?? '',
    sections: (plain.sections ?? []).map(toPublicSection),
    isPublished: Boolean(plain.isPublished),
    updatedAt: plain.updatedAt,
  };
};

const toListItem = (doc) => {
  const plain = typeof doc.toObject === 'function' ? doc.toObject() : doc;
  return {
    slug: plain.slug,
    title: plain.title ?? '',
    subtitle: plain.subtitle ?? '',
    isPublished: Boolean(plain.isPublished),
    updatedAt: plain.updatedAt,
  };
};

/** Multer / form-data may leave `sections` as a JSON string. */
const parseMaybeJson = (value) => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed) return value;
  if (!(trimmed.startsWith('{') || trimmed.startsWith('['))) return value;
  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
};

export const parseContentPageBody = (req, _res, next) => {
  if (req.body?.sections !== undefined) {
    req.body.sections = parseMaybeJson(req.body.sections);
  }
  if (req.body?.isPublished !== undefined && typeof req.body.isPublished === 'string') {
    if (req.body.isPublished === 'true') req.body.isPublished = true;
    else if (req.body.isPublished === 'false') req.body.isPublished = false;
  }
  next();
};

/**
 * @desc    List content pages (public: published only; admin + ?includeDrafts=true: all)
 * @route   GET /api/v1/settings/pages
 * @access  Public (optional admin Bearer for drafts)
 */
export const getContentPages = asyncHandler(async (req, res) => {
  await ContentPage.ensureDefaults();

  const includeDrafts =
    req.user?.role === 'admin' && String(req.query.includeDrafts) === 'true';

  const filter = includeDrafts ? {} : { isPublished: true };
  const pages = await ContentPage.find(filter).sort({ slug: 1 }).lean();

  sendResponse(res, {
    message: 'Content pages retrieved successfully',
    data: pages.map(toListItem),
  });
});

/**
 * @desc    Get one content page by slug
 * @route   GET /api/v1/settings/pages/:slug
 * @access  Public (unpublished only for admin)
 */
export const getContentPage = asyncHandler(async (req, res, next) => {
  await ContentPage.ensureDefaults();

  const { slug } = req.params;
  if (!ContentPage.isValidSlug(slug)) {
    return next(new ApiError(`Invalid page slug: ${slug}`, 400));
  }

  const page = await ContentPage.findOne({ slug });
  if (!page) return next(new ApiError(`No page found with slug: ${slug}`, 404));

  if (!page.isPublished && req.user?.role !== 'admin') {
    return next(new ApiError(`No page found with slug: ${slug}`, 404));
  }

  sendResponse(res, {
    message: 'Content page retrieved successfully',
    data: toPublicPage(page),
  });
});

/**
 * @desc    Update a content page by slug
 * @route   PUT /api/v1/settings/pages/:slug
 * @access  Admin
 */
export const updateContentPage = asyncHandler(async (req, res, next) => {
  await ContentPage.ensureDefaults();

  const { slug } = req.params;
  if (!ContentPage.isValidSlug(slug)) {
    return next(new ApiError(`Invalid page slug: ${slug}`, 400));
  }

  const page = await ContentPage.findOne({ slug });
  if (!page) return next(new ApiError(`No page found with slug: ${slug}`, 404));

  const previousPublished = page.isPublished;

  if (req.body.title !== undefined) page.title = String(req.body.title).trim();
  if (req.body.subtitle !== undefined) page.subtitle = String(req.body.subtitle ?? '').trim();
  if (req.body.isPublished !== undefined) {
    page.isPublished = req.body.isPublished === true || req.body.isPublished === 'true';
  }

  if (req.body.sections !== undefined) {
    if (!Array.isArray(req.body.sections)) {
      return next(new ApiError('sections must be an array', 400));
    }

    page.sections = req.body.sections.map((section, index) => ({
      key: String(section?.key ?? `section-${index + 1}`).trim() || `section-${index + 1}`,
      title: String(section?.title ?? '').trim(),
      subtitle: String(section?.subtitle ?? '').trim(),
      body: String(section?.body ?? ''),
      items: normalizeItems(section?.items),
      buttonLabel: String(section?.buttonLabel ?? '').trim(),
    }));
    page.markModified('sections');
  }

  await page.save();

  recordAdminActivity(req, {
    tab: 'websiteContent',
    action: 'update',
    resourceType: 'contentPage',
    resourceId: slug,
    resourceLabel: page.title || slug,
    summary: `Updated content page "${page.title || slug}"`,
    changes:
      req.body.isPublished !== undefined && previousPublished !== page.isPublished
        ? { isPublished: { from: previousPublished, to: page.isPublished } }
        : null,
  });

  sendResponse(res, {
    message: 'Content page updated successfully',
    data: toPublicPage(page),
  });
});

export { CONTENT_PAGE_SLUGS };
