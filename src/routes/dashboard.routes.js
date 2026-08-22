// src/routes/dashboard.routes.js
import { Router } from 'express';
import { getDashboard, getDashboardRevenue } from '../controllers/dashboard.controller.js';
import {
  dashboardOverviewValidator,
  dashboardRevenueValidator,
} from '../validators/dashboard.validator.js';
import { protectedRoutes, allowTo } from '../middlewares/auth.middleware.js';
import { requirePermission } from '../middlewares/permission.middleware.js';

const router = Router();

router.use(protectedRoutes, allowTo('admin'));

router.get('/', requirePermission('dashboard', 'read'), dashboardOverviewValidator, getDashboard);
router.get(
  '/revenue',
  requirePermission('dashboard', 'read'),
  dashboardRevenueValidator,
  getDashboardRevenue
);

export default router;
