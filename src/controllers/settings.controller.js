// src/controllers/settings.controller.js
import asyncHandler from 'express-async-handler';
import SiteSettings from '../models/SiteSettings.js';
import ApiError from '../utils/apiError.js';
import sendResponse from '../utils/apiResponse.js';
import sendEmail from '../utils/email.js';
import contactMessageTemplate from '../utils/emailTemplates/contactMessageTemplate.js';
import { recordAdminActivity } from '../utils/adminActivity.js';
import { buildWhatsAppUrl } from '../utils/whatsappUrl.js';
import { parsePhoneDigits, validateWhatsAppPhone } from '../utils/phoneNumber.js';

const SOCIAL_KEYS = ['facebook', 'twitter', 'instagram', 'linkedin', 'youtube'];
const INSTAGRAM_SLOTS = SiteSettings.INSTAGRAM_SLOTS;
const HOW_IT_WORKS_STEPS = SiteSettings.HOW_IT_WORKS_STEPS;
const UTILITY_BAR_KEYS = ['default', 'shop', 'product'];

const toContact = (doc) => {
  const whatsapp = doc.contact?.whatsapp ?? '';
  const whatsappDialCode = doc.contact?.whatsappDialCode ?? '20';
  return {
    phone: doc.contact?.phone ?? '',
    email: doc.contact?.email ?? '',
    location: doc.contact?.location ?? '',
    whatsapp,
    whatsappDialCode,
    /** Ready-to-use deep link for the WhatsApp icon (empty when number not set). */
    whatsappUrl: buildWhatsAppUrl(whatsapp, whatsappDialCode),
  };
};

const toSocial = (doc) => ({
  facebook: doc.social?.facebook ?? '',
  twitter: doc.social?.twitter ?? '',
  instagram: doc.social?.instagram ?? '',
  linkedin: doc.social?.linkedin ?? '',
  youtube: doc.social?.youtube ?? '',
});

const toInstagramPosts = (doc) =>
  (doc.instagramPosts ?? []).map((post, index) => ({
    index,
    image: post.image ?? '',
    postUrl: post.postUrl ?? '',
    alt: post.alt ?? '',
  }));

const toHowItWorks = (doc) => {
  const section = doc.howItWorks ?? {};
  return {
    title: section.title ?? 'How it works',
    thumbnailImage: section.thumbnailImage ?? '',
    videoUrl: section.videoUrl ?? '',
    steps: (section.steps ?? []).map((step, index) => ({
      index,
      title: step.title ?? '',
      description: step.description ?? '',
    })),
  };
};

const toUtilityBar = (doc) => {
  const section = doc.utilityBar ?? {};
  return {
    default: {
      title: section.default?.title ?? '',
      subtitle: section.default?.subtitle ?? '',
    },
    shop: {
      title: section.shop?.title ?? '',
      subtitle: section.shop?.subtitle ?? '',
    },
    product: {
      title: section.product?.title ?? '',
      subtitle: section.product?.subtitle ?? '',
    },
  };
};

const toPublicSettings = (doc) => {
  const plain = typeof doc.toObject === 'function' ? doc.toObject() : doc;
  return {
    contact: toContact(plain),
    social: toSocial(plain),
    instagramPosts: toInstagramPosts(plain),
    howItWorks: toHowItWorks(plain),
    utilityBar: toUtilityBar(plain),
    updatedAt: plain.updatedAt,
  };
};

/** Multer may leave nested JSON as a string when sent via multipart. */
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

/** Run before Instagram validators so multipart JSON string fields become arrays. */
export const parseInstagramBody = (req, _res, next) => {
  if (req.body?.instagramPosts !== undefined) {
    req.body.instagramPosts = parseMaybeJson(req.body.instagramPosts);
  }
  if (req.body?.posts !== undefined) {
    req.body.posts = parseMaybeJson(req.body.posts);
  }
  next();
};

/** Run before How it works validators so multipart JSON string fields become arrays. */
export const parseHowItWorksBody = (req, _res, next) => {
  if (req.body?.steps !== undefined) {
    req.body.steps = parseMaybeJson(req.body.steps);
  }
  next();
};

/**
 * @desc    Get all public site settings
 * @route   GET /api/v1/settings
 * @access  Public
 */
export const getSettings = asyncHandler(async (_req, res) => {
  const settings = await SiteSettings.getSingleton();
  sendResponse(res, {
    message: 'Site settings retrieved successfully',
    data: toPublicSettings(settings),
  });
});

/**
 * @desc    Get contact info
 * @route   GET /api/v1/settings/contact
 * @access  Public
 */
export const getContactSettings = asyncHandler(async (_req, res) => {
  const settings = await SiteSettings.getSingleton();
  sendResponse(res, {
    message: 'Contact settings retrieved successfully',
    data: toContact(settings),
  });
});

/**
 * @desc    Update contact info
 * @route   PUT /api/v1/settings/contact
 * @access  Admin
 */
export const updateContactSettings = asyncHandler(async (req, res, next) => {
  const settings = await SiteSettings.getSingleton();
  const { phone, email, location, whatsapp, whatsappDialCode } = req.body;

  if (phone !== undefined) settings.contact.phone = String(phone).trim();
  if (email !== undefined) settings.contact.email = String(email).trim().toLowerCase();
  if (location !== undefined) settings.contact.location = String(location).trim();

  const nextDialCode =
    whatsappDialCode !== undefined
      ? parsePhoneDigits(whatsappDialCode)
      : parsePhoneDigits(settings.contact.whatsappDialCode ?? '20');

  if (whatsappDialCode !== undefined) {
    if (!nextDialCode || nextDialCode.length < 1 || nextDialCode.length > 4) {
      return next(new ApiError('WhatsApp country code must be 1–4 digits', 400));
    }
    settings.contact.whatsappDialCode = nextDialCode;
  }

  if (whatsapp !== undefined) {
    const nextWhatsapp = String(whatsapp).trim();
    const check = validateWhatsAppPhone(nextWhatsapp, nextDialCode);
    if (!check.ok) return next(new ApiError(check.message, 400));
    settings.contact.whatsapp = nextWhatsapp;
  } else if (whatsappDialCode !== undefined && settings.contact.whatsapp?.trim()) {
    const check = validateWhatsAppPhone(settings.contact.whatsapp, nextDialCode);
    if (!check.ok) return next(new ApiError(check.message, 400));
  }

  settings.markModified('contact');
  await settings.save();

  recordAdminActivity(req, {
    tab: 'settings',
    action: 'update',
    resourceType: 'siteSettings',
    resourceId: 'contact',
    resourceLabel: 'Contact settings',
    summary: 'Updated contact settings',
  });

  sendResponse(res, {
    message: 'Contact settings updated successfully',
    data: toContact(settings),
  });
});

/**
 * @desc    Get social media links
 * @route   GET /api/v1/settings/social
 * @access  Public
 */
export const getSocialSettings = asyncHandler(async (_req, res) => {
  const settings = await SiteSettings.getSingleton();
  sendResponse(res, {
    message: 'Social settings retrieved successfully',
    data: toSocial(settings),
  });
});

/**
 * @desc    Update social media links
 * @route   PUT /api/v1/settings/social
 * @access  Admin
 */
export const updateSocialSettings = asyncHandler(async (req, res) => {
  const settings = await SiteSettings.getSingleton();

  for (const key of SOCIAL_KEYS) {
    if (req.body[key] === undefined) continue;
    settings.social[key] = String(req.body[key] ?? '').trim();
  }

  settings.markModified('social');
  await settings.save();

  recordAdminActivity(req, {
    tab: 'settings',
    action: 'update',
    resourceType: 'siteSettings',
    resourceId: 'social',
    resourceLabel: 'Social settings',
    summary: 'Updated social media settings',
  });

  sendResponse(res, {
    message: 'Social settings updated successfully',
    data: toSocial(settings),
  });
});

/**
 * @desc    Get Instagram grid posts
 * @route   GET /api/v1/settings/instagram
 * @access  Public
 */
export const getInstagramSettings = asyncHandler(async (_req, res) => {
  const settings = await SiteSettings.getSingleton();
  sendResponse(res, {
    message: 'Instagram settings retrieved successfully',
    data: toInstagramPosts(settings),
  });
});

/**
 * @desc    Update Instagram grid (4 slots: image + postUrl + alt)
 * @route   PUT /api/v1/settings/instagram
 * @access  Admin
 *
 * Body: { posts: [{ image?, postUrl?, alt? }, ...] } length 4
 * Files (optional): instagramImage0 … instagramImage3
 */
export const updateInstagramSettings = asyncHandler(async (req, res, next) => {
  const settings = await SiteSettings.getSingleton();
  const posts = req.body.posts ?? req.body.instagramPosts;

  if (posts !== undefined) {
    if (!Array.isArray(posts) || posts.length !== INSTAGRAM_SLOTS) {
      return next(new ApiError(`posts must contain exactly ${INSTAGRAM_SLOTS} items`, 400));
    }

    settings.instagramPosts = posts.map((post, index) => {
      const current = settings.instagramPosts[index] || {};
      return {
        image:
          post?.image !== undefined && post.image !== null && String(post.image).trim() !== ''
            ? String(post.image).trim()
            : current.image || '',
        postUrl:
          post?.postUrl !== undefined && post.postUrl !== null
            ? String(post.postUrl).trim()
            : current.postUrl || '',
        alt:
          post?.alt !== undefined && post.alt !== null
            ? String(post.alt).trim()
            : current.alt || '',
      };
    });
  }

  const files = req.files && typeof req.files === 'object' ? req.files : {};
  for (let index = 0; index < INSTAGRAM_SLOTS; index += 1) {
    const uploaded = files[`instagramImage${index}`]?.[0];
    if (!uploaded?.path) continue;
    if (!settings.instagramPosts[index]) {
      settings.instagramPosts[index] = { image: '', postUrl: '', alt: '' };
    }
    settings.instagramPosts[index].image = uploaded.path;
  }

  settings.markModified('instagramPosts');
  await settings.save();

  recordAdminActivity(req, {
    tab: 'settings',
    action: 'update',
    resourceType: 'siteSettings',
    resourceId: 'instagram',
    resourceLabel: 'Instagram settings',
    summary: 'Updated Instagram grid settings',
  });

  sendResponse(res, {
    message: 'Instagram settings updated successfully',
    data: toInstagramPosts(settings),
  });
});

/**
 * @desc    Get How it works section
 * @route   GET /api/v1/settings/how-it-works
 * @access  Public
 */
export const getHowItWorksSettings = asyncHandler(async (_req, res) => {
  const settings = await SiteSettings.getSingleton();
  sendResponse(res, {
    message: 'How it works settings retrieved successfully',
    data: toHowItWorks(settings),
  });
});

/**
 * @desc    Update How it works section
 * @route   PUT /api/v1/settings/how-it-works
 * @access  Admin
 *
 * Body: { title?, thumbnailImage?, videoUrl?, steps: [{ title?, description? }, ...] }
 * File (optional): thumbnailImage
 */
export const updateHowItWorksSettings = asyncHandler(async (req, res, next) => {
  const settings = await SiteSettings.getSingleton();
  if (!settings.howItWorks) settings.howItWorks = {};

  if (req.body.title !== undefined) {
    settings.howItWorks.title = String(req.body.title).trim();
  }
  if (req.body.videoUrl !== undefined) {
    settings.howItWorks.videoUrl = String(req.body.videoUrl ?? '').trim();
  }
  if (req.body.thumbnailImage !== undefined && String(req.body.thumbnailImage).trim() !== '') {
    settings.howItWorks.thumbnailImage = String(req.body.thumbnailImage).trim();
  }

  if (req.body.steps !== undefined) {
    if (!Array.isArray(req.body.steps) || req.body.steps.length !== HOW_IT_WORKS_STEPS) {
      return next(new ApiError(`steps must contain exactly ${HOW_IT_WORKS_STEPS} items`, 400));
    }

    settings.howItWorks.steps = req.body.steps.map((step, index) => {
      const current = settings.howItWorks.steps?.[index] || {};
      return {
        title:
          step?.title !== undefined && step.title !== null
            ? String(step.title).trim()
            : current.title || '',
        description:
          step?.description !== undefined && step.description !== null
            ? String(step.description).trim()
            : current.description || '',
      };
    });
  }

  if (req.file?.path) {
    settings.howItWorks.thumbnailImage = req.file.path;
  }

  settings.markModified('howItWorks');
  await settings.save();

  recordAdminActivity(req, {
    tab: 'settings',
    action: 'update',
    resourceType: 'siteSettings',
    resourceId: 'howItWorks',
    resourceLabel: 'How it works',
    summary: 'Updated How it works section',
  });

  sendResponse(res, {
    message: 'How it works settings updated successfully',
    data: toHowItWorks(settings),
  });
});

/**
 * @desc    Get utility bar promo messages
 * @route   GET /api/v1/settings/utility-bar
 * @access  Public
 */
export const getUtilityBarSettings = asyncHandler(async (_req, res) => {
  const settings = await SiteSettings.getSingleton();
  sendResponse(res, {
    message: 'Utility bar settings retrieved successfully',
    data: toUtilityBar(settings),
  });
});

/**
 * @desc    Update utility bar promo messages
 * @route   PUT /api/v1/settings/utility-bar
 * @access  Admin
 *
 * Body: { default?: { title?, subtitle? }, shop?: { title?, subtitle? }, product?: { title?, subtitle? } }
 */
export const updateUtilityBarSettings = asyncHandler(async (req, res) => {
  const settings = await SiteSettings.getSingleton();
  if (!settings.utilityBar) settings.utilityBar = {};

  for (const key of UTILITY_BAR_KEYS) {
    const payload = req.body[key];
    if (!payload || typeof payload !== 'object') continue;
    if (!settings.utilityBar[key]) settings.utilityBar[key] = { title: '', subtitle: '' };
    if (payload.title !== undefined) {
      settings.utilityBar[key].title = String(payload.title).trim();
    }
    if (payload.subtitle !== undefined) {
      settings.utilityBar[key].subtitle = String(payload.subtitle).trim();
    }
  }

  settings.markModified('utilityBar');
  await settings.save();

  recordAdminActivity(req, {
    tab: 'websiteContent',
    action: 'update',
    resourceType: 'siteSettings',
    resourceId: 'utilityBar',
    resourceLabel: 'Utility bar',
    summary: 'Updated utility bar promo messages',
  });

  sendResponse(res, {
    message: 'Utility bar settings updated successfully',
    data: toUtilityBar(settings),
  });
});

/**
 * @desc    Send contact-form email to the configured contact inbox
 * @route   POST /api/v1/settings/contact/message
 * @access  Public
 */
export const sendContactMessage = asyncHandler(async (req, res, next) => {
  const name = String(req.body.name ?? '').trim();
  const email = String(req.body.email ?? '').trim().toLowerCase();
  const message = String(req.body.message ?? '').trim();

  const settings = await SiteSettings.getSingleton();
  const inbox =
    settings.contact?.email?.trim() ||
    process.env.SEED_ADMIN_EMAIL ||
    process.env.EMAIL_USER;

  if (!inbox) {
    return next(new ApiError('Contact inbox is not configured on the server', 503));
  }

  const { subject, html, text } = contactMessageTemplate({ name, email, message });

  try {
    await sendEmail({
      email: inbox,
      subject,
      html,
      text,
      replyTo: email,
    });
  } catch {
    return next(new ApiError('Could not send your message. Please try again later.', 500));
  }

  sendResponse(res, {
    message: 'Your message has been sent successfully',
  });
});
