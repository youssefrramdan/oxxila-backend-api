// src/routes/subCategory.nested.routes.js
import { Router } from 'express';
import createUploader from '../middlewares/cloudnairyMiddleware.js';
import * as sub from '../controllers/subCategory.controller.js';
import { protectedRoutes, allowTo } from '../middlewares/auth.middleware.js';
import {
  createSubCategoryValidator,
  updateSubCategoryValidatorNested,
  nestedSubCategoryIdParams,
} from '../validators/subCategory.validator.js';
import {
  setSubcategoryCategoryFromParam,
  createNestedSubCategoryFilter,
  requireActiveParentCategory,
  requireParentCategoryForAdmin,
} from '../middlewares/catalogNested.middleware.js';

const R = Router({ mergeParams: true });
const subUpload = createUploader('oxxila/subcategories', {
  allowedFormats: ['jpeg', 'jpg', 'png', 'webp'],
  maxFileSizeMB: 2,
});

R.get(
  '/',
  createNestedSubCategoryFilter,
  requireActiveParentCategory,
  sub.getAllSubcategories
);
R.get('/:id', nestedSubCategoryIdParams, requireActiveParentCategory, sub.getSubCategory);

R.post(
  '/',
  protectedRoutes,
  allowTo('admin'),
  requireParentCategoryForAdmin,
  subUpload.single('image'),
  setSubcategoryCategoryFromParam,
  createSubCategoryValidator,
  sub.createSubCategory
);
R.put(
  '/:id',
  protectedRoutes,
  allowTo('admin'),
  requireParentCategoryForAdmin,
  subUpload.single('image'),
  updateSubCategoryValidatorNested,
  sub.updateSubCategory
);
R.delete(
  '/:id',
  protectedRoutes,
  allowTo('admin'),
  requireParentCategoryForAdmin,
  nestedSubCategoryIdParams,
  sub.deleteSubCategory
);

export const subCategoryNestedRouter = R;
