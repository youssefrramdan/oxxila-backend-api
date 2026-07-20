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

const router = Router();

router.use(protectedRoutes, allowTo('admin'));

router.get('/', getAllAdmins);
router.post('/', createAdminValidator, createAdmin);
router.get('/:id', adminIdValidator, getAdmin);
router.put('/:id', updateAdminValidator, updateAdmin);
router.delete('/:id', adminIdValidator, deleteAdmin);

export default router;
