// src/routes/user.routes.js
import { Router } from 'express';
import * as users from '../controllers/user.controller.js';
import { protectedRoutes, allowTo } from '../middlewares/auth.middleware.js';
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
router.get('/getMe', users.getMe);
router.get('/profile/addresses', users.getMyAddresses);
router.post('/profile/addresses', addMyAddressValidator, users.addMyAddress);
router.patch(
  '/profile/addresses/:addressId',
  updateMyAddressValidator,
  users.updateMyAddress
);
router.delete(
  '/profile/addresses/:addressId',
  myAddressIdParamValidator,
  users.deleteMyAddress
);
router.patch('/updateMe', updateMeValidator, users.updateMe);
router.patch('/updateMyAvatar', avatarUpload.single('avatar'), users.uploadMyAvatar);
router.patch('/updateMyPassword', updateMyPasswordValidator, users.updateMyPassword);
router.patch('/deactivateMe', users.deactivateMe);
router.patch('/activateMe', users.activateMe);

// ─── Admin-only ───────────────────────────────────────────────────────────────
router.use(allowTo('admin'));

router.route('/')
  .get(users.getAllUsers)
  .post(createUserValidator, users.createUser);

router.patch('/activate/:id', userIdParamValidator, users.activateSpecificUser);
router.patch('/changePassword/:id', changeUserPasswordValidator, users.changeUserPassword);

router.route('/:id')
  .get(userIdParamValidator, users.getSpecificUser)
  .put(updateUserValidator, users.updateUser)
  .delete(userIdParamValidator, users.deleteUser);

export default router;
