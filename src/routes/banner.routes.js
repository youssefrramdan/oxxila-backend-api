// src/routes/banner.routes.js
import { Router } from 'express';
import createUploader from '../middlewares/cloudnairyMiddleware.js';
import * as banners from '../controllers/banner.controller.js';
import { protectedRoutes, allowTo } from '../middlewares/auth.middleware.js';
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

router.get('/', banners.getBanners);

router.use(protectedRoutes, allowTo('admin'));
router.post('/', bannerUpload.single('image'), createBannerValidator, banners.createBanner);
router.put('/:id', bannerUpload.single('image'), updateBannerValidator, banners.updateBanner);
router.delete('/:id', bannerIdParamValidator, banners.deleteBanner);

export default router;
