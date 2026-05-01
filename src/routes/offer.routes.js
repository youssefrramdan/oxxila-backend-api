// src/routes/offer.routes.js
import { Router } from 'express';
import * as offers from '../controllers/offer.controller.js';
import { protectedRoutes, allowTo } from '../middlewares/auth.middleware.js';
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
router.post('/', createOfferValidator, offers.createOffer);
router.put('/:id', updateOfferValidator, offers.updateOffer);
router.delete('/', offers.deleteAllOffers);
router.delete('/:id', offerIdParamValidator, offers.deleteOffer);

export default router;
