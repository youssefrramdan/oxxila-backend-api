// src/routes/offer.routes.js
import { Router } from 'express';
import * as offers from '../controllers/offer.controller.js';
import { protectedRoutes, allowTo } from '../middlewares/auth.middleware.js';
import { requirePermission } from '../middlewares/permission.middleware.js';
import {
  createOfferValidator,
  updateOfferValidator,
  offerIdParamValidator,
} from '../validators/offer.validator.js';

const router = Router();

router.get('/upcoming', offers.getUpcomingOffer);
router.get('/', offers.getAllOffers);
router.get('/:id', offerIdParamValidator, offers.getOffer);

router.use(protectedRoutes, allowTo('admin'));
router.post(
  '/',
  requirePermission('settings', 'create'),
  createOfferValidator,
  offers.createOffer
);
router.put(
  '/:id',
  requirePermission('settings', 'update'),
  updateOfferValidator,
  offers.updateOffer
);
router.delete('/', requirePermission('settings', 'delete'), offers.deleteAllOffers);
router.delete(
  '/:id',
  requirePermission('settings', 'delete'),
  offerIdParamValidator,
  offers.deleteOffer
);

export default router;
