// src/routes/coupon.routes.js
import { Router } from 'express';
import {
  getCoupons,
  getCoupon,
  createCoupon,
  updateCoupon,
  deleteCoupon,
  applyCoupon,
} from '../controllers/coupon.controller.js';
import {
  createCouponValidator,
  updateCouponValidator,
  couponIdValidator,
  applyCouponValidator,
} from '../validators/coupon.validator.js';
import { protectedRoutes, allowTo } from '../middlewares/auth.middleware.js';

const router = Router();

router.post('/apply', protectedRoutes, applyCouponValidator, applyCoupon);

router.use(protectedRoutes, allowTo('admin'));

router.get('/', getCoupons);
router.post('/', createCouponValidator, createCoupon);

router.get('/:id', couponIdValidator, getCoupon);
router.put('/:id', updateCouponValidator, updateCoupon);
router.delete('/:id', couponIdValidator, deleteCoupon);

export default router;
