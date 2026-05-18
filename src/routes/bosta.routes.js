// src/routes/bosta.routes.js
import { Router } from 'express';
import { protectedRoutes, allowTo } from '../middlewares/auth.middleware.js';
import {
  createShipment,
  trackShipment,
  cancelShipment,
} from '../controllers/bosta.controller.js';

const router = Router();

router.use(protectedRoutes);

router.post('/orders/:orderId/ship', allowTo('admin'), createShipment);
router.delete('/orders/:orderId/ship', allowTo('admin'), cancelShipment);
router.get('/orders/:orderId/track', trackShipment);

export default router;
