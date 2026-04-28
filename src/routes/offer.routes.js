// src/routes/offer.routes.js
import { Router } from 'express';
import {
  getAllOffers,
  getUpcomingOffers,
  getOffer,
  createOffer,
  updateOffer,
  deleteOffer,
} from '../controllers/offer.controller.js';
import { protectedRoutes, allowTo } from '../middlewares/auth.middleware.js';
import {
  createOfferValidator,
  updateOfferValidator,
  offerIdParamValidator,
} from '../validators/offer.validator.js';

const router = Router();

router.get('/upcoming', getUpcomingOffers);
router.get('/', getAllOffers);
router.get('/:id', offerIdParamValidator, getOffer);

router.use(protectedRoutes, allowTo('admin'));
router.post('/', createOfferValidator, createOffer);
router.put('/:id', updateOfferValidator, updateOffer);
router.delete('/:id', offerIdParamValidator, deleteOffer);

export default router;
