// src/routes/product.routes.js
import { Router } from 'express';
import createUploader from '../middlewares/cloudnairyMiddleware.js';
import * as products from '../controllers/product.controller.js';
import { protectedRoutes, allowTo, optionalAuth } from '../middlewares/auth.middleware.js';
import {
  createProductValidator,
  updateProductValidator,
  productIdParamValidator,
} from '../validators/product.validator.js';

const router = Router();

const productUpload = createUploader('oxxila/products', {
  allowedFormats: ['jpeg', 'jpg', 'png', 'webp', 'pdf'],
  maxFileSizeMB: 15,
});

const productUploadFields = productUpload.fields([
  { name: 'images', maxCount: 5 },
  { name: 'certificationImage', maxCount: 1 },
  { name: 'catalog', maxCount: 1 },
]);

router.get('/', products.getAllProducts);
router.get('/:id', productIdParamValidator, optionalAuth, products.getProduct);

router.use(protectedRoutes, allowTo('admin'));
router.post('/', productUploadFields, createProductValidator, products.createProduct);
router.put('/:id', productUploadFields, updateProductValidator, products.updateProduct);
router.delete('/:id', productIdParamValidator, products.deleteProduct);

export default router;
