// src/routes/tracking.routes.js
import { Router } from 'express';
import { protectedRoutes } from '../middlewares/auth.middleware.js';
import {
  trackByTrackingNumber,
  trackMyOrder,
} from '../controllers/tracking.controller.js';
import {
  trackingNumberParamValidator,
  trackOrderIdParamValidator,
} from '../validators/tracking.validator.js';

const router = Router();

router.get(
  '/order/:orderId',
  protectedRoutes,
  trackOrderIdParamValidator,
  trackMyOrder
);
router.get('/:trackingNumber', trackingNumberParamValidator, trackByTrackingNumber);

export default router;
