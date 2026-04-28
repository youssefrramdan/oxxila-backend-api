// src/routes/category.routes.js
import { Router } from 'express';
import createUploader from '../middlewares/cloudnairyMiddleware.js';
import * as categories from '../controllers/category.controller.js';
import { subCategoryNestedRouter } from './subCategory.nested.routes.js';
import { protectedRoutes, allowTo } from '../middlewares/auth.middleware.js';
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
router.get('/', categories.getAllCategories);
router.get('/:id', categoryIdParamValidator, categories.getCategory);

router.use(protectedRoutes, allowTo('admin'));
// multipart must be parsed before express-validator reads req.body
router.post('/', categoryUpload.single('image'), createCategoryValidator, categories.createCategory);
router.put(
  '/:id',
  categoryUpload.single('image'),
  updateCategoryValidator,
  categories.updateCategory
);
router.delete('/:id', categoryIdParamValidator, categories.deleteCategory);

export default router;
