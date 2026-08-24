// src/routes/contentPage.routes.js
import { Router } from 'express';
import createUploader from '../middlewares/cloudnairyMiddleware.js';
import { protectedRoutes, allowTo, optionalAuth } from '../middlewares/auth.middleware.js';
import { requirePermission } from '../middlewares/permission.middleware.js';
import {
  getContentPages,
  getContentPage,
  updateContentPage,
  parseContentPageBody,
  MAX_SECTION_UPLOADS,
} from '../controllers/contentPage.controller.js';
import {
  contentPageSlugValidator,
  updateContentPageValidator,
} from '../validators/contentPage.validator.js';

const router = Router();

const sectionImageUpload = createUploader('oxxila/settings/pages', {
  allowedFormats: ['jpeg', 'jpg', 'png', 'webp'],
  maxFileSizeMB: 10,
});

const sectionImageFields = [
  { name: 'sectionImage', maxCount: 1 },
  ...Array.from({ length: MAX_SECTION_UPLOADS }, (_, index) => ({
    name: `sectionImage${index}`,
    maxCount: 1,
  })),
];

router.get('/', optionalAuth, getContentPages);
router.get('/:slug', optionalAuth, contentPageSlugValidator, getContentPage);

router.put(
  '/:slug',
  protectedRoutes,
  allowTo('admin'),
  requirePermission('websiteContent', 'update'),
  sectionImageUpload.fields(sectionImageFields),
  parseContentPageBody,
  updateContentPageValidator,
  updateContentPage,
);

export default router;
