// src/routes/reports.routes.js
import { Router } from 'express';
import {
  exportProductSalesCsv,
  exportSingleProductSalesCsv,
  getProductSalesReport,
  getSingleProductSalesReport,
} from '../controllers/reports.controller.js';
import {
  productSalesDetailExportValidator,
  productSalesDetailValidator,
  productSalesExportValidator,
  productSalesListValidator,
} from '../validators/reports.validator.js';
import { protectedRoutes, allowTo } from '../middlewares/auth.middleware.js';
import { requirePermission } from '../middlewares/permission.middleware.js';

const router = Router();

router.use(protectedRoutes, allowTo('admin'));

router.get(
  '/product-sales/export',
  requirePermission('reports', 'read'),
  productSalesExportValidator,
  exportProductSalesCsv,
);

router.get(
  '/product-sales/:productId/export',
  requirePermission('reports', 'read'),
  productSalesDetailExportValidator,
  exportSingleProductSalesCsv,
);

router.get(
  '/product-sales/:productId',
  requirePermission('reports', 'read'),
  productSalesDetailValidator,
  getSingleProductSalesReport,
);

router.get(
  '/product-sales',
  requirePermission('reports', 'read'),
  productSalesListValidator,
  getProductSalesReport,
);

export default router;
