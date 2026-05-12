// src/routes/faq.routes.js
import { Router } from 'express';
import {
  getProductFaqs,
  createFaq,
  updateFaq,
  deleteFaq,
  askSpecialist,
} from '../controllers/faq.controller.js';
import {
  createProductFaqValidator,
  updateFaqValidator,
  faqIdValidator,
  getProductFaqsValidator,
  askSpecialistValidator,
} from '../validators/faq.validator.js';
import { protectedRoutes, allowTo } from '../middlewares/auth.middleware.js';

const router = Router();

router.put('/:id', protectedRoutes, allowTo('admin'), updateFaqValidator, updateFaq);
router.delete('/:id', protectedRoutes, allowTo('admin'), faqIdValidator, deleteFaq);

export default router;

export const productFaqRouter = Router({ mergeParams: true });

productFaqRouter.get('/', getProductFaqsValidator, getProductFaqs);
productFaqRouter.post(
  '/ask',
  askSpecialistValidator,
  askSpecialist
);
productFaqRouter.post(
  '/',
  protectedRoutes,
  allowTo('admin'),
  createProductFaqValidator,
  createFaq
);
