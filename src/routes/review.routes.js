// src/routes/review.routes.js
import { Router } from 'express';
import {
  getProductReviews,
  getReview,
  createReview,
  updateReview,
  deleteReview,
  toggleLike,
  getProductRatingStats,
} from '../controllers/review.controller.js';
import {
  createProductReviewValidator,
  updateReviewValidator,
  reviewIdValidator,
  getProductReviewsValidator,
  getProductRatingStatsValidator,
} from '../validators/review.validator.js';
import { protectedRoutes, allowTo } from '../middlewares/auth.middleware.js';

const router = Router();

router.get('/:id', reviewIdValidator, getReview);
router.put('/:id', protectedRoutes, updateReviewValidator, updateReview);
router.delete('/:id', protectedRoutes, reviewIdValidator, deleteReview);
router.post('/:id/like', protectedRoutes, reviewIdValidator, toggleLike);

export default router;

export const productReviewRouter = Router({ mergeParams: true });

productReviewRouter.get('/stats', getProductRatingStatsValidator, getProductRatingStats);
productReviewRouter.get('/', getProductReviewsValidator, getProductReviews);
productReviewRouter.post(
  '/',
  protectedRoutes,
  allowTo('user', 'admin'),
  createProductReviewValidator,
  createReview
);
