// src/routes/return.routes.js
import { Router } from 'express';
import createUploader from '../middlewares/cloudnairyMiddleware.js';
import {
  getEligibleReturnOrders,
  createReturnRequest,
  getMyReturnRequests,
  getMyReturnRequest,
  getReturnRequests,
  getReturnRequest,
  updateReturnStatus,
} from '../controllers/return.controller.js';
import {
  createReturnValidator,
  returnIdParamValidator,
  updateReturnStatusValidator,
} from '../validators/return.validator.js';
import { protectedRoutes, allowTo } from '../middlewares/auth.middleware.js';
import ApiError from '../utils/apiError.js';

const router = Router();

const prepareReturnBody = (req, res, next) => {
  try {
    if (typeof req.body.items === 'string') req.body.items = JSON.parse(req.body.items);
    if (typeof req.body.pickupAddress === 'string') {
      req.body.pickupAddress = JSON.parse(req.body.pickupAddress);
    }
    next();
  } catch {
    next(new ApiError('Invalid JSON in items or pickupAddress', 400));
  }
};

const proofUpload = createUploader('oxxila/returns/proof', {
  allowedFormats: ['jpeg', 'jpg', 'png', 'webp'],
  maxFileSizeMB: 10,
});

router.use(protectedRoutes);

router.get('/eligible-orders', getEligibleReturnOrders);
router.post(
  '/',
  proofUpload.array('proofImages', 5),
  prepareReturnBody,
  createReturnValidator,
  createReturnRequest
);
router.get('/my-returns', getMyReturnRequests);
router.get('/my-returns/:id', returnIdParamValidator, getMyReturnRequest);

router.use(allowTo('admin'));

router.get('/', getReturnRequests);
router.patch('/:id/status', updateReturnStatusValidator, updateReturnStatus);
router.get('/:id', returnIdParamValidator, getReturnRequest);

export default router;
