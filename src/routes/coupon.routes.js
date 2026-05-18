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

const router = Router();

router.use(protectedRoutes, allowTo('admin'));

router.get('/', getCoupons);
router.post('/', createCouponValidator, createCoupon);

router.get('/:id', couponIdValidator, getCoupon);
router.put('/:id', updateCouponValidator, updateCoupon);
router.delete('/:id', couponIdValidator, deleteCoupon);

export default router;
