// src/controllers/contentPage.controller.js
import asyncHandler from 'express-async-handler';
import ContentPage, {
  CONTENT_PAGE_SLUGS,
  CONTENT_SECTION_LAYOUTS,
} from '../models/ContentPage.js';
import ApiError from '../utils/apiError.js';
import sendResponse from '../utils/apiResponse.js';

const MAX_SECTION_UPLOADS = 12;

const normalizeLayout = (value) => {
  const layout = String(value ?? 'text').trim();
  return CONTENT_SECTION_LAYOUTS.includes(layout) ? layout : 'text';
};

const normalizeItems = (items) => {
  if (!Array.isArray(items)) return [];
  return items.map((item) => ({
    title: String(item?.title ?? '').trim(),
    description: String(item?.description ?? '').trim(),
  }));
};

const toPublicSection = (section) => ({
  key: section.key,
  layout: normalizeLayout(section.layout),
  title: section.title ?? '',
  subtitle: section.subtitle ?? '',
  body: section.body ?? '',
  image: section.image ?? '',
  items: (section.items ?? []).map((item) => ({
    title: item.title ?? '',
    description: item.description ?? '',
  })),
  buttonLabel: section.buttonLabel ?? '',
  buttonHref: section.buttonHref ?? '',
});

const toPublicPage = (doc) => {
  const plain = typeof doc.toObject === 'function' ? doc.toObject() : doc;
  return {
    slug: plain.slug,
    title: plain.title ?? '',
    subtitle: plain.subtitle ?? '',
    content: plain.content ?? '',
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

const applySectionUploads = (page, req, next) => {
  // Legacy single upload: sectionImage + sectionKey
  if (req.file?.path && req.body.sectionKey) {
    const key = String(req.body.sectionKey).trim();
    const target = page.sections.find((section) => section.key === key);
    if (!target) {
      next(new ApiError(`No section found with key: ${key}`, 404));
      return false;
    }
    target.image = req.file.path;
    page.markModified('sections');
  }

  // Multi upload: sectionImage0… + sectionKey0…
  const files = req.files && !Array.isArray(req.files) ? req.files : null;
  if (!files) return true;

  for (let index = 0; index < MAX_SECTION_UPLOADS; index += 1) {
    const uploaded = files[`sectionImage${index}`]?.[0];
    if (!uploaded?.path) continue;
    const key = String(req.body[`sectionKey${index}`] ?? '').trim();
    if (!key) {
      next(new ApiError(`sectionKey${index} is required when uploading sectionImage${index}`, 400));
      return false;
    }
    const target = page.sections.find((section) => section.key === key);
    if (!target) {
      next(new ApiError(`No section found with key: ${key}`, 404));
      return false;
    }
    target.image = uploaded.path;
    page.markModified('sections');
  }

  return true;
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
      layout: normalizeLayout(section?.layout),
      title: String(section?.title ?? '').trim(),
      subtitle: String(section?.subtitle ?? '').trim(),
      body: String(section?.body ?? ''),
      image: String(section?.image ?? '').trim(),
      items: normalizeItems(section?.items),
      buttonLabel: String(section?.buttonLabel ?? '').trim(),
      buttonHref: String(section?.buttonHref ?? '').trim(),
    }));
    page.markModified('sections');
  }

  if (!applySectionUploads(page, req, next)) return;

  await page.save();

  sendResponse(res, {
    message: 'Content page updated successfully',
    data: toPublicPage(page),
  });
});

export { CONTENT_PAGE_SLUGS, CONTENT_SECTION_LAYOUTS, MAX_SECTION_UPLOADS };
