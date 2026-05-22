// src/routes/shipping.routes.js
import { Router } from 'express';
import {
  getCountries,
  getGovernorates,
  getZones,
  resolveShippingPrice,
} from '../controllers/shipping.controller.js';
import { countryIdParamValidator } from '../validators/country.validator.js';
import { governorateIdParamValidator } from '../validators/governorate.validator.js';
import { shippingPriceQueryValidator } from '../validators/shipping.validator.js';

const router = Router();

router.get('/countries', getCountries);
router.get('/countries/:id/governorates', countryIdParamValidator, getGovernorates);
router.get('/governorates/:id/zones', governorateIdParamValidator, getZones);
router.get('/resolve', shippingPriceQueryValidator, resolveShippingPrice);

export default router;
