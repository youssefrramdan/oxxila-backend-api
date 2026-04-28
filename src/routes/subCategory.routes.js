// src/routes/subCategory.routes.js
import { Router } from 'express';
import * as subcategories from '../controllers/subCategory.controller.js';
import { subCategoryIdParamValidator } from '../validators/subCategory.validator.js';

const router = Router();

// Flat read-only: full list and single doc (use nested for admin CRUD and category-scoped list).
router.get('/', subcategories.getAllSubcategories);
router.get('/:id', subCategoryIdParamValidator, subcategories.getSubCategory);

export default router;
