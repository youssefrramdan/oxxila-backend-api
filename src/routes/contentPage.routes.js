// src/routes/contentPage.routes.js
import { Router } from 'express';
import { protectedRoutes, allowTo, optionalAuth } from '../middlewares/auth.middleware.js';
import { requirePermission } from '../middlewares/permission.middleware.js';
import {
  getContentPages,
  getContentPage,
  updateContentPage,
  parseContentPageBody,
} from '../controllers/contentPage.controller.js';
import {
  contentPageSlugValidator,
  updateContentPageValidator,
} from '../validators/contentPage.validator.js';

const router = Router();

router.get('/', optionalAuth, getContentPages);
router.get('/:slug', optionalAuth, contentPageSlugValidator, getContentPage);

router.put(
  '/:slug',
  protectedRoutes,
  allowTo('admin'),
  requirePermission('websiteContent', 'update'),
  parseContentPageBody,
  updateContentPageValidator,
  updateContentPage,
);

export default router;
