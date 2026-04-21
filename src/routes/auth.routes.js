// src/routes/auth.routes.js
import { Router } from 'express';
import * as auth from '../controllers/auth.controller.js';
import { protectedRoutes } from '../middlewares/auth.middleware.js';
import {
  registerValidator,
  loginValidator,
  forgetPasswordValidator,
  resetPasswordValidator,
  verifyResetTokenValidator,
} from '../validators/auth.validator.js';

const router = Router();

router.post('/register', registerValidator, auth.register);
router.post('/login', loginValidator, auth.login);
router.post('/refresh', auth.refreshAccessToken);
router.post('/logout', auth.logout);
router.get('/me', protectedRoutes, auth.me);

router.post('/forgot-password', forgetPasswordValidator, auth.forgetPassword);
router.get('/reset-password/:token', verifyResetTokenValidator, auth.verifyResetToken);
router.post('/reset-password/:token', resetPasswordValidator, auth.resetPassword);

// Google OAuth — no validators needed; Passport handles the handshake.
router.get('/google', auth.googleRedirect);
router.get('/google/callback', auth.googleCallback);

router.get('/facebook', auth.facebookRedirect);
router.get('/facebook/callback', auth.facebookCallback);

export default router;
