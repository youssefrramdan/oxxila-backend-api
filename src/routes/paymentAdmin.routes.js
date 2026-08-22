// src/routes/paymentAdmin.routes.js
import { Router } from 'express';
import {
  getPaymentSummary,
  getCartRecovery,
  getPaymentGateways,
  updatePaymentGateway,
} from '../controllers/paymentAdmin.controller.js';
import {
  paymentSummaryValidator,
  updatePaymentGatewayValidator,
} from '../validators/paymentAdmin.validator.js';
import { protectedRoutes, allowTo } from '../middlewares/auth.middleware.js';
import { requirePermission } from '../middlewares/permission.middleware.js';

const router = Router();

router.use(protectedRoutes, allowTo('admin'));

router.get(
  '/summary',
  requirePermission('settings', 'read'),
  paymentSummaryValidator,
  getPaymentSummary
);
router.get(
  '/cart-recovery',
  requirePermission('settings', 'read'),
  paymentSummaryValidator,
  getCartRecovery
);
router.get('/gateways', requirePermission('settings', 'read'), getPaymentGateways);
router.patch(
  '/gateways/:code',
  requirePermission('settings', 'update'),
  updatePaymentGatewayValidator,
  updatePaymentGateway
);

export default router;
