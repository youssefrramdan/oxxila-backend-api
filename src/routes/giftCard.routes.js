// src/routes/giftCard.routes.js
import { Router } from 'express';
import { protectedRoutes } from '../middlewares/auth.middleware.js';
// Customer Gift Cards = store credit balance (fed by COD return refunds)
import { getMyGiftCards } from '../controllers/giftCard.controller.js';

const router = Router();

router.use(protectedRoutes);
router.get('/', getMyGiftCards);

export default router;
