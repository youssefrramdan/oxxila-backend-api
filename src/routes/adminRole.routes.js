// src/routes/adminRole.routes.js
import { Router } from 'express';
import { protectedRoutes, allowTo } from '../middlewares/auth.middleware.js';
import { requirePermission } from '../middlewares/permission.middleware.js';
import {
  getAdminRoleTabs,
  getAdminRoles,
  getAdminRole,
  createAdminRole,
  updateAdminRole,
  deleteAdminRole,
} from '../controllers/adminRole.controller.js';
import {
  createAdminRoleValidator,
  updateAdminRoleValidator,
  adminRoleIdValidator,
} from '../validators/adminRole.validator.js';

const router = Router();

router.use(protectedRoutes, allowTo('admin'));

router.get('/tabs', requirePermission('roles', 'read'), getAdminRoleTabs);
router.get('/', requirePermission('roles', 'read'), getAdminRoles);
router.post('/', requirePermission('roles', 'create'), createAdminRoleValidator, createAdminRole);
router.get('/:id', requirePermission('roles', 'read'), adminRoleIdValidator, getAdminRole);
router.put('/:id', requirePermission('roles', 'update'), updateAdminRoleValidator, updateAdminRole);
router.delete('/:id', requirePermission('roles', 'delete'), adminRoleIdValidator, deleteAdminRole);

export default router;
