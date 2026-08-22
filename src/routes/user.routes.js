// src/routes/user.routes.js
import { Router } from 'express';
import {
  getAllUsers,
  getCustomerStats,
  getSpecificUser,
  createUser,
  updateUser,
  deleteUser,
  activateSpecificUser,
  changeUserPassword,
} from '../controllers/userAdmin.controller.js';
import {
  getMe,
  getMyAddresses,
  addMyAddress,
  updateMyAddress,
  deleteMyAddress,
  setMyDefaultAddress,
  updateMe,
  uploadMyAvatar,
  updateMyPassword,
  deactivateMe,
  activateMe,
} from '../controllers/userProfile.controller.js';
import {
  clearBrowsingHistory,
  getBrowsingHistory,
  getRecommendations,
} from '../controllers/browsingHistory.controller.js';
import { protectedRoutes, allowTo } from '../middlewares/auth.middleware.js';
import { requirePermission } from '../middlewares/permission.middleware.js';
import createUploader from '../middlewares/cloudnairyMiddleware.js';
import {
  createUserValidator,
  updateUserValidator,
  userIdParamValidator,
  changeUserPasswordValidator,
  updateMeValidator,
  updateMyPasswordValidator,
  addMyAddressValidator,
  updateMyAddressValidator,
  myAddressIdParamValidator,
} from '../validators/user.validator.js';

const router = Router();

const avatarUpload = createUploader('oxxila/users/avatars', {
  allowedFormats: ['jpeg', 'jpg', 'png', 'webp'],
  maxFileSizeMB: 2,
});

// Every route below requires a valid JWT.
router.use(protectedRoutes);

// ─── Self-service (must come before /:id to avoid route collisions) ───────────
router.get('/getMe', getMe);
router.get('/profile/addresses', getMyAddresses);
router.post('/profile/addresses', addMyAddressValidator, addMyAddress);
router.patch(
  '/profile/addresses/:addressId',
  updateMyAddressValidator,
  updateMyAddress
);
router.patch(
  '/profile/addresses/:addressId/default',
  myAddressIdParamValidator,
  setMyDefaultAddress
);
router.delete(
  '/profile/addresses/:addressId',
  myAddressIdParamValidator,
  deleteMyAddress
);
router.patch('/updateMe', updateMeValidator, updateMe);
router.patch('/updateMyAvatar', avatarUpload.single('avatar'), uploadMyAvatar);
router.patch('/updateMyPassword', updateMyPasswordValidator, updateMyPassword);
router.patch('/deactivateMe', deactivateMe);
router.patch('/activateMe', activateMe);

router.get('/browsing-history', getBrowsingHistory);
router.delete('/browsing-history', clearBrowsingHistory);
router.get('/recommendations', getRecommendations);

// ─── Admin-only ───────────────────────────────────────────────────────────────
router.use(allowTo('admin'));

router.get('/stats', requirePermission('customers', 'read'), getCustomerStats);

router.route('/')
  .get(requirePermission('customers', 'read'), getAllUsers)
  .post(requirePermission('customers', 'create'), createUserValidator, createUser);

router.patch(
  '/activate/:id',
  requirePermission('customers', 'update'),
  userIdParamValidator,
  activateSpecificUser
);
router.patch(
  '/changePassword/:id',
  requirePermission('customers', 'update'),
  changeUserPasswordValidator,
  changeUserPassword
);

router.route('/:id')
  .get(requirePermission('customers', 'read'), userIdParamValidator, getSpecificUser)
  .put(requirePermission('customers', 'update'), updateUserValidator, updateUser)
  .delete(requirePermission('customers', 'delete'), userIdParamValidator, deleteUser);

export default router;
