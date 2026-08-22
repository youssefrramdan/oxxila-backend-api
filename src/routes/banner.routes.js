// src/routes/banner.routes.js
import { Router } from 'express';
import createUploader from '../middlewares/cloudnairyMiddleware.js';
import * as banners from '../controllers/banner.controller.js';
import { protectedRoutes, allowTo, optionalAuth } from '../middlewares/auth.middleware.js';
import { requirePermission } from '../middlewares/permission.middleware.js';
import {
  createBannerValidator,
  updateBannerValidator,
  bannerIdParamValidator,
} from '../validators/banner.validator.js';

const router = Router();

const bannerUpload = createUploader('oxxila/banners', {
  allowedFormats: ['jpeg', 'jpg', 'png', 'webp'],
  maxFileSizeMB: 10,
});

// Public storefront: active only. Admin can pass ?includeInactive=true with Bearer.
router.get('/', optionalAuth, banners.getBanners);

router.use(protectedRoutes, allowTo('admin'));
router.post(
  '/',
  requirePermission('settings', 'create'),
  bannerUpload.single('image'),
  createBannerValidator,
  banners.createBanner
);
router.put(
  '/:id',
  requirePermission('settings', 'update'),
  bannerUpload.single('image'),
  updateBannerValidator,
  banners.updateBanner
);
router.delete(
  '/:id',
  requirePermission('settings', 'delete'),
  bannerIdParamValidator,
  banners.deleteBanner
);

export default router;
