// src/routes/search.routes.js
import { Router } from 'express';
import { suggestSearch } from '../controllers/search.controller.js';

const router = Router();
router.get('/suggest', suggestSearch);
export default router;
