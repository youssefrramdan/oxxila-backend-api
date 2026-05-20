// src/routes/shipping.admin.routes.js
import { Router } from "express";
import { protectedRoutes, allowTo } from "../middlewares/auth.middleware.js";
import {
  getCountries,
  createCountry,
  updateCountry,
  deleteCountry,
} from "../controllers/country.controller.js";
import {
  getGovernoratesByCountry,
  createGovernorate,
  updateGovernorate,
  deleteGovernorate,
} from "../controllers/governorate.controller.js";
import {
  getDistrictsByGovernorate,
  createDistrict,
  updateDistrict,
  deleteDistrict,
} from "../controllers/district.controller.js";
import {
  createCountryValidator,
  updateCountryValidator,
  countryIdParamValidator,
} from "../validators/country.validator.js";
import {
  createGovernorateValidator,
  updateGovernorateValidator,
  governorateIdParamValidator,
} from "../validators/governorate.validator.js";
import {
  createDistrictValidator,
  updateDistrictValidator,
  districtIdParamValidator,
} from "../validators/district.validator.js";
import {
  getCarriers,
  createCarrier,
  updateCarrier,
  deleteCarrier,
  getCarrierCoverage,
  updateCarrierCoverage,
  syncBostaZonesForCarrier,
  getBostaPickupLocations,
} from "../controllers/carrier.controller.js";
import {
  getCarrierPickups,
  createCarrierPickup,
  deleteCarrierPickup,
  setDefaultCarrierPickup,
  getBostaDistrictsLookup,
} from "../controllers/carrierPickup.controller.js";
import {
  getOrderShippingDetail,
  assignOrderShipping,
} from "../controllers/orderShipping.controller.js";
import {
  getSettings,
  updateSettings,
} from "../controllers/shippingSettings.controller.js";
import {
  createCarrierValidator,
  updateCarrierValidator,
  updateCoverageValidator,
  carrierIdParamValidator,
} from "../validators/carrier.validator.js";
import {
  carrierPickupParamValidator,
  pickupIdParamValidator,
  createPickupValidator,
} from "../validators/carrierPickup.validator.js";
import {
  assignOrderShippingValidator,
  orderShippingDetailValidator,
} from "../validators/orderShipping.validator.js";

const router = Router();

router.use(protectedRoutes, allowTo("admin"));

router.get("/countries", getCountries);
router.post("/countries", createCountryValidator, createCountry);
router.put("/countries/:id", updateCountryValidator, updateCountry);
router.delete("/countries/:id", countryIdParamValidator, deleteCountry);
router.get(
  "/countries/:id/governorates",
  countryIdParamValidator,
  getGovernoratesByCountry,
);

router.post("/governorates", createGovernorateValidator, createGovernorate);
router.put("/governorates/:id", updateGovernorateValidator, updateGovernorate);
router.delete(
  "/governorates/:id",
  governorateIdParamValidator,
  deleteGovernorate,
);
router.get(
  "/governorates/:id/districts",
  governorateIdParamValidator,
  getDistrictsByGovernorate,
);

router.post("/districts", createDistrictValidator, createDistrict);
router.put("/districts/:id", updateDistrictValidator, updateDistrict);
router.delete("/districts/:id", districtIdParamValidator, deleteDistrict);

router.get("/carriers", getCarriers);
router.get("/carriers/bosta-pickups", getBostaPickupLocations);
router.post("/carriers", createCarrierValidator, createCarrier);

router.put("/carriers/:id", updateCarrierValidator, updateCarrier);
router.delete("/carriers/:id", carrierIdParamValidator, deleteCarrier);
router.get(
  "/carriers/:id/coverage",
  carrierIdParamValidator,
  getCarrierCoverage,
);
router.put(
  "/carriers/:id/coverage",
  updateCoverageValidator,
  updateCarrierCoverage,
);
router.post(
  "/carriers/:id/bosta/sync-zones",
  carrierIdParamValidator,
  syncBostaZonesForCarrier,
);

router.get(
  "/carriers/:id/pickups",
  carrierPickupParamValidator,
  getCarrierPickups,
);
router.post(
  "/carriers/:id/pickups",
  createPickupValidator,
  createCarrierPickup,
);
router.delete(
  "/carriers/:id/pickups/:pickupId",
  pickupIdParamValidator,
  deleteCarrierPickup,
);
router.put(
  "/carriers/:id/pickups/:pickupId/default",
  pickupIdParamValidator,
  setDefaultCarrierPickup,
);
router.get(
  "/carriers/:id/bosta/districts-lookup",
  carrierPickupParamValidator,
  getBostaDistrictsLookup,
);

router.get(
  "/shipping/orders/:id",
  orderShippingDetailValidator,
  getOrderShippingDetail,
);
router.post(
  "/shipping/orders/:id/assign",
  assignOrderShippingValidator,
  assignOrderShipping,
);

router.get("/shipping-settings", getSettings);
router.put("/shipping-settings", updateSettings);

export default router;
