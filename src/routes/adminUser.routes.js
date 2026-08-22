// src/routes/adminUser.routes.js
import { Router } from 'express';
import {
  getAllAdmins,
  getAdmin,
  createAdmin,
  updateAdmin,
  deleteAdmin,
} from '../controllers/adminUser.controller.js';
import {
  createAdminValidator,
  updateAdminValidator,
  adminIdValidator,
} from '../validators/admin.validator.js';
import { protectedRoutes, allowTo } from '../middlewares/auth.middleware.js';
import { requirePermission } from '../middlewares/permission.middleware.js';

const router = Router();

router.use(protectedRoutes, allowTo('admin'));

router.get('/', requirePermission('roles', 'read'), getAllAdmins);
router.post('/', requirePermission('roles', 'create'), createAdminValidator, createAdmin);
router.get('/:id', requirePermission('roles', 'read'), adminIdValidator, getAdmin);
router.put('/:id', requirePermission('roles', 'update'), updateAdminValidator, updateAdmin);
router.delete('/:id', requirePermission('roles', 'delete'), adminIdValidator, deleteAdmin);

export default router;
