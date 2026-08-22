// src/routes/subCategory.routes.js
import { Router } from 'express';
import * as subcategories from '../controllers/subCategory.controller.js';
import { optionalAuth } from '../middlewares/auth.middleware.js';
import { subCategoryIdParamValidator } from '../validators/subCategory.validator.js';

const router = Router();

// Flat read-only: full list and single doc (use nested for admin CRUD and category-scoped list).
// Public: active only. Admin can pass ?includeInactive=true with Bearer.
router.get('/', optionalAuth, subcategories.getAllSubcategories);
router.get(
  '/:id',
  optionalAuth,
  subCategoryIdParamValidator,
  subcategories.getSubCategory
);

export default router;
