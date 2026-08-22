// src/routes/brand.routes.js
import { Router } from 'express';
import createUploader from '../middlewares/cloudnairyMiddleware.js';
import * as brands from '../controllers/brand.controller.js';
import { protectedRoutes, allowTo } from '../middlewares/auth.middleware.js';
import { requirePermission } from '../middlewares/permission.middleware.js';
import {
  createBrandValidator,
  updateBrandValidator,
  brandIdParamValidator,
} from '../validators/brand.validator.js';

const router = Router();
const brandUpload = createUploader('oxxila/brands', {
  allowedFormats: ['jpeg', 'jpg', 'png', 'webp'],
  maxFileSizeMB: 2,
});

router.get('/', brands.getAllBrands);
router.get('/:id', brandIdParamValidator, brands.getBrand);

router.use(protectedRoutes, allowTo('admin'));
router.post(
  '/',
  requirePermission('brands', 'create'),
  brandUpload.single('logo'),
  createBrandValidator,
  brands.createBrand
);
router.put(
  '/:id',
  requirePermission('brands', 'update'),
  brandUpload.single('logo'),
  updateBrandValidator,
  brands.updateBrand
);
router.delete(
  '/:id',
  requirePermission('brands', 'delete'),
  brandIdParamValidator,
  brands.deleteBrand
);

export default router;
