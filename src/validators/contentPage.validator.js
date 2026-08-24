// src/validators/contentPage.validator.js
import { body, param } from 'express-validator';
import validate from '../middlewares/validate.middleware.js';
import { CONTENT_PAGE_SLUGS } from '../models/ContentPage.js';

const slugParam = () =>
  param('slug')
    .isIn(CONTENT_PAGE_SLUGS)
    .withMessage(`slug must be one of: ${CONTENT_PAGE_SLUGS.join(', ')}`);

export const contentPageSlugValidator = [slugParam(), validate];

export const updateContentPageValidator = [
  slugParam(),
  body('title')
    .optional()
    .trim()
    .isLength({ min: 2, max: 200 })
    .withMessage('title must be 2–200 characters'),
  body('subtitle')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('subtitle cannot exceed 500 characters'),
  body('isPublished')
    .optional()
    .isBoolean()
    .withMessage('isPublished must be a boolean'),
  body('sections').optional().isArray().withMessage('sections must be an array'),
  body('sections.*.key')
    .optional()
    .trim()
    .isLength({ min: 1, max: 60 })
    .withMessage('section key must be 1–60 characters'),
  body('sections.*.title')
    .optional()
    .trim()
    .isLength({ max: 200 })
    .withMessage('section title cannot exceed 200 characters'),
  body('sections.*.subtitle')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('section subtitle cannot exceed 500 characters'),
  body('sections.*.body')
    .optional()
    .isString()
    .withMessage('section body must be a string')
    .isLength({ max: 20000 })
    .withMessage('section body cannot exceed 20000 characters'),
  body('sections.*.items').optional().isArray().withMessage('section items must be an array'),
  body('sections.*.items.*.title')
    .optional()
    .trim()
    .isLength({ max: 200 })
    .withMessage('item title cannot exceed 200 characters'),
  body('sections.*.items.*.description')
    .optional()
    .trim()
    .isLength({ max: 2000 })
    .withMessage('item description cannot exceed 2000 characters'),
  body('sections.*.buttonLabel')
    .optional()
    .trim()
    .isLength({ max: 120 })
    .withMessage('buttonLabel cannot exceed 120 characters'),
  validate,
];
