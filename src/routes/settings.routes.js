// src/routes/settings.routes.js
import { Router } from 'express';
import createUploader from '../middlewares/cloudnairyMiddleware.js';
import { protectedRoutes, allowTo } from '../middlewares/auth.middleware.js';
import { requirePermission } from '../middlewares/permission.middleware.js';
import {
  getSettings,
  getContactSettings,
  updateContactSettings,
  getSocialSettings,
  updateSocialSettings,
  getInstagramSettings,
  updateInstagramSettings,
  getHowItWorksSettings,
  updateHowItWorksSettings,
  sendContactMessage,
  parseInstagramBody,
  parseHowItWorksBody,
} from '../controllers/settings.controller.js';
import {
  updateContactSettingsValidator,
  updateSocialSettingsValidator,
  updateInstagramSettingsValidator,
  updateHowItWorksSettingsValidator,
  sendContactMessageValidator,
} from '../validators/settings.validator.js';
import SiteSettings from '../models/SiteSettings.js';

const router = Router();

const instagramUpload = createUploader('oxxila/settings/instagram', {
  allowedFormats: ['jpeg', 'jpg', 'png', 'webp'],
  maxFileSizeMB: 10,
});

const howItWorksUpload = createUploader('oxxila/settings/how-it-works', {
  allowedFormats: ['jpeg', 'jpg', 'png', 'webp'],
  maxFileSizeMB: 10,
});

const instagramImageFields = Array.from(
  { length: SiteSettings.INSTAGRAM_SLOTS },
  (_, index) => ({ name: `instagramImage${index}`, maxCount: 1 }),
);

// Full bundle (storefront convenience)
router.get('/', getSettings);

// Contact info
router.get('/contact', getContactSettings);
router.put(
  '/contact',
  protectedRoutes,
  allowTo('admin'),
  requirePermission('settings', 'update'),
  updateContactSettingsValidator,
  updateContactSettings,
);

// Contact form → email
router.post('/contact/message', sendContactMessageValidator, sendContactMessage);

// Social links
router.get('/social', getSocialSettings);
router.put(
  '/social',
  protectedRoutes,
  allowTo('admin'),
  requirePermission('settings', 'update'),
  updateSocialSettingsValidator,
  updateSocialSettings,
);

// Instagram grid
router.get('/instagram', getInstagramSettings);
router.put(
  '/instagram',
  protectedRoutes,
  allowTo('admin'),
  requirePermission('settings', 'update'),
  instagramUpload.fields(instagramImageFields),
  parseInstagramBody,
  updateInstagramSettingsValidator,
  updateInstagramSettings,
);

// How it works section
router.get('/how-it-works', getHowItWorksSettings);
router.put(
  '/how-it-works',
  protectedRoutes,
  allowTo('admin'),
  requirePermission('settings', 'update'),
  howItWorksUpload.single('thumbnailImage'),
  parseHowItWorksBody,
  updateHowItWorksSettingsValidator,
  updateHowItWorksSettings,
);

export default router;
