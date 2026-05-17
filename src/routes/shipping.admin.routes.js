// src/routes/shipping.admin.routes.js
import { Router } from 'express';
import { protectedRoutes, allowTo } from '../middlewares/auth.middleware.js';
import {
  getCountries,
  createCountry,
  updateCountry,
  deleteCountry,
} from '../controllers/country.controller.js';
import {
  getGovernoratesByCountry,
  createGovernorate,
  updateGovernorate,
  deleteGovernorate,
} from '../controllers/governorate.controller.js';
import {
  getDistrictsByGovernorate,
  createDistrict,
  updateDistrict,
  deleteDistrict,
} from '../controllers/district.controller.js';
import {
  createCountryValidator,
  updateCountryValidator,
  countryIdParamValidator,
} from '../validators/country.validator.js';
import {
  createGovernorateValidator,
  updateGovernorateValidator,
  governorateIdParamValidator,
} from '../validators/governorate.validator.js';
import {
  createDistrictValidator,
  updateDistrictValidator,
  districtIdParamValidator,
} from '../validators/district.validator.js';
import {
  getCarriers,
  createCarrier,
  updateCarrier,
  deleteCarrier,
  getCarrierCoverage,
  updateCarrierCoverage,
} from '../controllers/carrier.controller.js';
import { getSettings, updateSettings } from '../controllers/shippingSettings.controller.js';
import {
  createCarrierValidator,
  updateCarrierValidator,
  updateCoverageValidator,
  carrierIdParamValidator,
} from '../validators/carrier.validator.js';

const router = Router();

router.use(protectedRoutes, allowTo('admin'));

router.get('/countries', getCountries);
router.post('/countries', createCountryValidator, createCountry);
router.put('/countries/:id', updateCountryValidator, updateCountry);
router.delete('/countries/:id', countryIdParamValidator, deleteCountry);
router.get('/countries/:id/governorates', countryIdParamValidator, getGovernoratesByCountry);

router.post('/governorates', createGovernorateValidator, createGovernorate);
router.put('/governorates/:id', updateGovernorateValidator, updateGovernorate);
router.delete('/governorates/:id', governorateIdParamValidator, deleteGovernorate);
router.get('/governorates/:id/districts', governorateIdParamValidator, getDistrictsByGovernorate);

router.post('/districts', createDistrictValidator, createDistrict);
router.put('/districts/:id', updateDistrictValidator, updateDistrict);
router.delete('/districts/:id', districtIdParamValidator, deleteDistrict);

router.get('/carriers', getCarriers);
router.post('/carriers', createCarrierValidator, createCarrier);
router.put('/carriers/:id', updateCarrierValidator, updateCarrier);
router.delete('/carriers/:id', carrierIdParamValidator, deleteCarrier);
router.get('/carriers/:id/coverage', carrierIdParamValidator, getCarrierCoverage);
router.put('/carriers/:id/coverage', updateCoverageValidator, updateCarrierCoverage);

router.get('/shipping-settings', getSettings);
router.put('/shipping-settings', updateSettings);

export default router;
