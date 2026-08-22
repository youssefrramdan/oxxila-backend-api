// src/routes/coupon.routes.js
import { Router } from 'express';
import {
  getCoupons,
  getCoupon,
  createCoupon,
  updateCoupon,
  deleteCoupon,
} from '../controllers/coupon.controller.js';
import {
  createCouponValidator,
  updateCouponValidator,
  couponIdValidator,
} from '../validators/coupon.validator.js';
import { protectedRoutes, allowTo } from '../middlewares/auth.middleware.js';
import { requirePermission } from '../middlewares/permission.middleware.js';

const router = Router();

router.use(protectedRoutes, allowTo('admin'));

router.get('/', requirePermission('settings', 'read'), getCoupons);
router.post(
  '/',
  requirePermission('settings', 'create'),
  createCouponValidator,
  createCoupon
);

router.get('/:id', requirePermission('settings', 'read'), couponIdValidator, getCoupon);
router.put(
  '/:id',
  requirePermission('settings', 'update'),
  updateCouponValidator,
  updateCoupon
);
router.delete(
  '/:id',
  requirePermission('settings', 'delete'),
  couponIdValidator,
  deleteCoupon
);

export default router;
