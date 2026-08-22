// src/controllers/contentPage.controller.js
import asyncHandler from 'express-async-handler';
import ContentPage, { CONTENT_PAGE_SLUGS } from '../models/ContentPage.js';
import ApiError from '../utils/apiError.js';
import sendResponse from '../utils/apiResponse.js';

const toPublicPage = (doc) => {
  const plain = typeof doc.toObject === 'function' ? doc.toObject() : doc;
  return {
    slug: plain.slug,
    title: plain.title ?? '',
    subtitle: plain.subtitle ?? '',
    content: plain.content ?? '',
    sections: (plain.sections ?? []).map((section) => ({
      key: section.key,
      title: section.title ?? '',
      body: section.body ?? '',
      image: section.image ?? '',
    })),
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

/** Multer may leave `sections` as a JSON string. */
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

  if (req.body.title !== undefined) page.title = String(req.body.title).trim();
  if (req.body.subtitle !== undefined) page.subtitle = String(req.body.subtitle ?? '').trim();
  if (req.body.content !== undefined) page.content = String(req.body.content ?? '');
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
      body: String(section?.body ?? ''),
      image: String(section?.image ?? '').trim(),
    }));
    page.markModified('sections');
  }

  // Optional single section image upload: field name `sectionImage` + body `sectionKey`
  if (req.file?.path && req.body.sectionKey) {
    const key = String(req.body.sectionKey).trim();
    const target = page.sections.find((section) => section.key === key);
    if (!target) {
      return next(new ApiError(`No section found with key: ${key}`, 404));
    }
    target.image = req.file.path;
    page.markModified('sections');
  }

  await page.save();

  sendResponse(res, {
    message: 'Content page updated successfully',
    data: toPublicPage(page),
  });
});

export { CONTENT_PAGE_SLUGS };
