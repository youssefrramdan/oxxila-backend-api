// src/routes/category.routes.js
import { Router } from 'express';
import createUploader from '../middlewares/cloudnairyMiddleware.js';
import * as categories from '../controllers/category.controller.js';
import { subCategoryNestedRouter } from './subCategory.nested.routes.js';
import { protectedRoutes, allowTo, optionalAuth } from '../middlewares/auth.middleware.js';
import { requirePermission } from '../middlewares/permission.middleware.js';
import {
  createCategoryValidator,
  updateCategoryValidator,
  categoryIdParamValidator,
} from '../validators/category.validator.js';

const router = Router();
const categoryUpload = createUploader('oxxila/categories', {
  allowedFormats: ['jpeg', 'jpg', 'png', 'webp'],
  maxFileSizeMB: 2,
});

router.use('/:categoryId/subcategories', subCategoryNestedRouter);
// Public: active only. Admin can pass ?includeInactive=true with Bearer.
router.get('/', optionalAuth, categories.getAllCategories);
router.get('/:id', optionalAuth, categoryIdParamValidator, categories.getCategory);

router.use(protectedRoutes, allowTo('admin'));
router.post(
  '/',
  requirePermission('categories', 'create'),
  categoryUpload.single('image'),
  createCategoryValidator,
  categories.createCategory
);
router.put(
  '/:id',
  requirePermission('categories', 'update'),
  categoryUpload.single('image'),
  updateCategoryValidator,
  categories.updateCategory
);
router.delete(
  '/:id',
  requirePermission('categories', 'delete'),
  categoryIdParamValidator,
  categories.deleteCategory
);

export default router;
