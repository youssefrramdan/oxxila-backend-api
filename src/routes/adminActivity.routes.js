// src/routes/adminActivity.routes.js
import { Router } from 'express';
import { protectedRoutes, allowTo } from '../middlewares/auth.middleware.js';
import { requireSuperAdmin } from '../middlewares/superAdmin.middleware.js';
import { listAdminActivityLogs } from '../controllers/adminActivity.controller.js';

const router = Router();

router.use(protectedRoutes, allowTo('admin'), requireSuperAdmin);
router.get('/', listAdminActivityLogs);

export default router;
