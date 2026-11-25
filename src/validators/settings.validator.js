// src/validators/settings.validator.js
import { body } from 'express-validator';
import validate from '../middlewares/validate.middleware.js';
import { parsePhoneDigits, validateWhatsAppPhone } from '../utils/phoneNumber.js';

const optionalTrimmedUrl = (field) =>
  body(field)
    .optional({ values: 'falsy' })
    .trim()
    .isURL({ require_protocol: true, protocols: ['http', 'https'] })
    .withMessage(`${field} must be a valid http(s) URL`);

export const updateContactSettingsValidator = [
  body('phone')
    .optional()
    .trim()
    .isLength({ min: 3, max: 40 })
    .withMessage('phone must be 3–40 characters'),
  body('email')
    .optional()
    .trim()
    .isEmail()
    .withMessage('email must be a valid email')
    .normalizeEmail(),
  body('location')
    .optional()
    .trim()
    .isLength({ min: 2, max: 120 })
    .withMessage('location must be 2–120 characters'),
  body('whatsappDialCode')
    .optional({ values: 'null' })
    .trim()
    .custom((value) => {
      if (value === undefined || value === '') return true;
      const dial = parsePhoneDigits(value);
      if (!dial || dial.length < 1 || dial.length > 4) {
        throw new Error('whatsappDialCode must be 1–4 digits');
      }
      return true;
    }),
  body('whatsapp')
    .optional({ values: 'null' })
    .trim()
    .custom((value, { req }) => {
      if (value === undefined || value === '') return true;
      const dialCode = parsePhoneDigits(req.body.whatsappDialCode) || '20';
      const check = validateWhatsAppPhone(value, dialCode);
      if (!check.ok) throw new Error(check.message);
      return true;
    }),
  validate,
];

export const updateSocialSettingsValidator = [
  optionalTrimmedUrl('facebook'),
  optionalTrimmedUrl('twitter'),
  optionalTrimmedUrl('instagram'),
  optionalTrimmedUrl('linkedin'),
  optionalTrimmedUrl('youtube'),
  validate,
];

export const updateDeliverySettingsValidator = [
  body('messageEn').optional().trim().isLength({ max: 240 }).withMessage('messageEn must be at most 240 characters'),
  body('messageAr').optional().trim().isLength({ max: 240 }).withMessage('messageAr must be at most 240 characters'),
  body('minDays').optional().isInt({ min: 0, max: 60 }).withMessage('minDays must be 0–60'),
  body('maxDays')
    .optional()
    .isInt({ min: 0, max: 60 })
    .withMessage('maxDays must be 0–60')
    .custom((value, { req }) => req.body.minDays === undefined || Number(value) >= Number(req.body.minDays))
    .withMessage('maxDays must be greater than or equal to minDays'),
  validate,
];

export const updateInstagramSettingsValidator = [
  body('posts')
    .optional()
    .isArray({ min: 4, max: 4 })
    .withMessage('posts must be an array of exactly 4 items'),
  body('instagramPosts')
    .optional()
    .isArray({ min: 4, max: 4 })
    .withMessage('instagramPosts must be an array of exactly 4 items'),
  body('posts.*.image')
    .optional({ values: 'falsy' })
    .trim()
    .isURL({ require_protocol: true, protocols: ['http', 'https'] })
    .withMessage('Each post image must be a valid URL'),
  body('posts.*.postUrl')
    .optional({ values: 'falsy' })
    .trim()
    .isURL({ require_protocol: true, protocols: ['http', 'https'] })
    .withMessage('Each postUrl must be a valid URL'),
  body('posts.*.alt')
    .optional()
    .trim()
    .isLength({ max: 200 })
    .withMessage('post alt cannot exceed 200 characters'),
  body('instagramPosts.*.image')
    .optional({ values: 'falsy' })
    .trim()
    .isURL({ require_protocol: true, protocols: ['http', 'https'] })
    .withMessage('Each instagram post image must be a valid URL'),
  body('instagramPosts.*.postUrl')
    .optional({ values: 'falsy' })
    .trim()
    .isURL({ require_protocol: true, protocols: ['http', 'https'] })
    .withMessage('Each instagram postUrl must be a valid URL'),
  body('instagramPosts.*.alt')
    .optional()
    .trim()
    .isLength({ max: 200 })
    .withMessage('instagram post alt cannot exceed 200 characters'),
  validate,
];

export const updateHowItWorksSettingsValidator = [
  body('title')
    .optional()
    .trim()
    .isLength({ min: 2, max: 120 })
    .withMessage('title must be 2–120 characters'),
  body('titleEn')
    .optional()
    .trim()
    .isLength({ min: 2, max: 120 })
    .withMessage('titleEn must be 2–120 characters'),
  body('titleAr')
    .optional()
    .trim()
    .isLength({ max: 120 })
    .withMessage('titleAr cannot exceed 120 characters'),
  body('thumbnailImage')
    .optional({ values: 'falsy' })
    .trim()
    .isURL({ require_protocol: true, protocols: ['http', 'https'] })
    .withMessage('thumbnailImage must be a valid URL'),
  body('videoUrl')
    .optional({ values: 'falsy' })
    .trim()
    .isURL({ require_protocol: true, protocols: ['http', 'https'] })
    .withMessage('videoUrl must be a valid URL'),
  body('steps')
    .optional()
    .isArray({ min: 3, max: 3 })
    .withMessage('steps must be an array of exactly 3 items'),
  body('steps.*.title')
    .optional()
    .trim()
    .isLength({ min: 2, max: 120 })
    .withMessage('Each step title must be 2–120 characters'),
  body('steps.*.titleEn')
    .optional()
    .trim()
    .isLength({ min: 2, max: 120 })
    .withMessage('Each step titleEn must be 2–120 characters'),
  body('steps.*.titleAr')
    .optional()
    .trim()
    .isLength({ max: 120 })
    .withMessage('Each step titleAr cannot exceed 120 characters'),
  body('steps.*.description')
    .optional()
    .trim()
    .isLength({ min: 2, max: 1000 })
    .withMessage('Each step description must be 2–1000 characters'),
  body('steps.*.descriptionEn')
    .optional()
    .trim()
    .isLength({ min: 2, max: 1000 })
    .withMessage('Each step descriptionEn must be 2–1000 characters'),
  body('steps.*.descriptionAr')
    .optional()
    .trim()
    .isLength({ max: 1000 })
    .withMessage('Each step descriptionAr cannot exceed 1000 characters'),
  validate,
];

const utilityPromoFields = (prefix) => [
  body(`${prefix}.title`)
    .optional()
    .trim()
    .isLength({ max: 120 })
    .withMessage(`${prefix}.title cannot exceed 120 characters`),
  body(`${prefix}.titleEn`)
    .optional()
    .trim()
    .isLength({ max: 120 })
    .withMessage(`${prefix}.titleEn cannot exceed 120 characters`),
  body(`${prefix}.titleAr`)
    .optional()
    .trim()
    .isLength({ max: 120 })
    .withMessage(`${prefix}.titleAr cannot exceed 120 characters`),
  body(`${prefix}.subtitle`)
    .optional()
    .trim()
    .isLength({ max: 120 })
    .withMessage(`${prefix}.subtitle cannot exceed 120 characters`),
  body(`${prefix}.subtitleEn`)
    .optional()
    .trim()
    .isLength({ max: 120 })
    .withMessage(`${prefix}.subtitleEn cannot exceed 120 characters`),
  body(`${prefix}.subtitleAr`)
    .optional()
    .trim()
    .isLength({ max: 120 })
    .withMessage(`${prefix}.subtitleAr cannot exceed 120 characters`),
];

export const updateUtilityBarSettingsValidator = [
  body('promos')
    .optional()
    .isArray({ min: 1, max: 8 })
    .withMessage('promos must be an array of 1–8 items'),
  ...utilityPromoFields('promos.*'),
  body('rotateIntervalSeconds')
    .optional()
    .isInt({ min: 3, max: 60 })
    .withMessage('rotateIntervalSeconds must be between 3 and 60'),
  validate,
];

export const sendContactMessageValidator = [
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Name is required')
    .isLength({ min: 2, max: 80 })
    .withMessage('Name must be 2–80 characters'),
  body('email')
    .trim()
    .notEmpty()
    .withMessage('Email is required')
    .isEmail()
    .withMessage('Please provide a valid email')
    .normalizeEmail(),
  body('message')
    .trim()
    .notEmpty()
    .withMessage('Message is required')
    .isLength({ min: 5, max: 2000 })
    .withMessage('Message must be 5–2000 characters'),
  validate,
];
