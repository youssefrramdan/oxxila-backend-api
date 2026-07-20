// src/routes/dashboard.routes.js
import { Router } from 'express';
import { getDashboard, getDashboardRevenue } from '../controllers/dashboard.controller.js';
import {
  dashboardOverviewValidator,
  dashboardRevenueValidator,
} from '../validators/dashboard.validator.js';
import { protectedRoutes, allowTo } from '../middlewares/auth.middleware.js';

const router = Router();

router.use(protectedRoutes, allowTo('admin'));

router.get('/', dashboardOverviewValidator, getDashboard);
router.get('/revenue', dashboardRevenueValidator, getDashboardRevenue);

export default router;
