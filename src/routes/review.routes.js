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
  getReviewsAdminOverview,
  getReviewsAdminSummary,
  getReviewsAdminRatingDistribution,
  getReviewsAdminFlagged,
  getReviewsAdminList,
  getReviewsAdminDetail,
  updateReviewVisibility,
  updateReviewFlag,
} from '../controllers/reviewAdmin.controller.js';
import {
  createProductReviewValidator,
  updateReviewValidator,
  reviewIdValidator,
  getProductReviewsValidator,
  getProductRatingStatsValidator,
  adminReviewsListValidator,
  adminReviewsOverviewValidator,
  adminFlaggedQueueValidator,
  updateReviewVisibilityValidator,
  updateReviewFlagValidator,
} from '../validators/review.validator.js';
import { protectedRoutes, allowTo } from '../middlewares/auth.middleware.js';

const router = Router();

const adminRouter = Router();
adminRouter.use(protectedRoutes, allowTo('admin'));

adminRouter.get('/overview', adminReviewsOverviewValidator, getReviewsAdminOverview);
adminRouter.get('/summary', getReviewsAdminSummary);
adminRouter.get('/rating-distribution', getReviewsAdminRatingDistribution);
adminRouter.get('/flagged', adminFlaggedQueueValidator, getReviewsAdminFlagged);
adminRouter.get('/', adminReviewsListValidator, getReviewsAdminList);
adminRouter.get('/:id', reviewIdValidator, getReviewsAdminDetail);

router.use('/admin', adminRouter);

router.patch(
  '/:id/visibility',
  protectedRoutes,
  allowTo('admin'),
  updateReviewVisibilityValidator,
  updateReviewVisibility
);
router.patch(
  '/:id/flag',
  protectedRoutes,
  allowTo('admin'),
  updateReviewFlagValidator,
  updateReviewFlag
);

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
