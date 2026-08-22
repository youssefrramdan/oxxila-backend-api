// src/routes/shipping.admin.routes.js
import { Router } from "express";
import { protectedRoutes, allowTo } from "../middlewares/auth.middleware.js";
import { requirePermission } from "../middlewares/permission.middleware.js";
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
  syncBostaCoverageForCarrier,
} from "../controllers/carrier.controller.js";
import {
  getCarrierPickups,
  createCarrierPickup,
  deleteCarrierPickup,
  setDefaultCarrierPickup,
  getBostaDistrictsLookup,
  syncBostaPickupsForCarrier,
  getBostaPickupLocations,
} from "../controllers/carrierPickup.controller.js";
import {
  getOrderShippingDetail,
  assignOrderShipping,
  updateManualOrderShippingStatus,
} from "../controllers/orderShipping.controller.js";
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
  updateManualOrderShippingStatusValidator,
} from "../validators/orderShipping.validator.js";
import {
  getShippingMethods,
  updateShippingMethod,
} from "../controllers/shippingMethod.controller.js";
import { updateShippingMethodValidator } from "../validators/shippingMethod.validator.js";

const router = Router();

router.use(protectedRoutes, allowTo("admin"));

router.get(
  "/shipping/methods",
  requirePermission("shipping", "read"),
  getShippingMethods,
);
router.patch(
  "/shipping/methods/:type",
  requirePermission("shipping", "update"),
  updateShippingMethodValidator,
  updateShippingMethod,
);

router.get("/countries", requirePermission("shipping", "read"), getCountries);
router.post(
  "/countries",
  requirePermission("shipping", "create"),
  createCountryValidator,
  createCountry,
);
router.put(
  "/countries/:id",
  requirePermission("shipping", "update"),
  updateCountryValidator,
  updateCountry,
);
router.delete(
  "/countries/:id",
  requirePermission("shipping", "delete"),
  countryIdParamValidator,
  deleteCountry,
);
router.get(
  "/countries/:id/governorates",
  requirePermission("shipping", "read"),
  countryIdParamValidator,
  getGovernoratesByCountry,
);

router.post(
  "/governorates",
  requirePermission("shipping", "create"),
  createGovernorateValidator,
  createGovernorate,
);
router.put(
  "/governorates/:id",
  requirePermission("shipping", "update"),
  updateGovernorateValidator,
  updateGovernorate,
);
router.delete(
  "/governorates/:id",
  requirePermission("shipping", "delete"),
  governorateIdParamValidator,
  deleteGovernorate,
);
router.get(
  "/governorates/:id/districts",
  requirePermission("shipping", "read"),
  governorateIdParamValidator,
  getDistrictsByGovernorate,
);

router.post(
  "/districts",
  requirePermission("shipping", "create"),
  createDistrictValidator,
  createDistrict,
);
router.put(
  "/districts/:id",
  requirePermission("shipping", "update"),
  updateDistrictValidator,
  updateDistrict,
);
router.delete(
  "/districts/:id",
  requirePermission("shipping", "delete"),
  districtIdParamValidator,
  deleteDistrict,
);

router.get("/carriers", requirePermission("shipping", "read"), getCarriers);
router.get(
  "/carriers/bosta-pickups",
  requirePermission("shipping", "read"),
  getBostaPickupLocations,
);
router.post(
  "/carriers",
  requirePermission("shipping", "create"),
  createCarrierValidator,
  createCarrier,
);

router.put(
  "/carriers/:id",
  requirePermission("shipping", "update"),
  updateCarrierValidator,
  updateCarrier,
);
router.delete(
  "/carriers/:id",
  requirePermission("shipping", "delete"),
  carrierIdParamValidator,
  deleteCarrier,
);
router.get(
  "/carriers/:id/coverage",
  requirePermission("shipping", "read"),
  carrierIdParamValidator,
  getCarrierCoverage,
);
router.put(
  "/carriers/:id/coverage",
  requirePermission("shipping", "update"),
  updateCoverageValidator,
  updateCarrierCoverage,
);
router.post(
  "/carriers/:id/bosta/sync-zones",
  requirePermission("shipping", "create"),
  carrierIdParamValidator,
  syncBostaZonesForCarrier,
);
router.post(
  "/carriers/:id/bosta/sync-coverage",
  requirePermission("shipping", "create"),
  carrierIdParamValidator,
  syncBostaCoverageForCarrier,
);
router.post(
  "/carriers/:id/bosta/sync-pickups",
  requirePermission("shipping", "create"),
  carrierIdParamValidator,
  syncBostaPickupsForCarrier,
);

router.get(
  "/carriers/:id/pickups",
  requirePermission("shipping", "read"),
  carrierPickupParamValidator,
  getCarrierPickups,
);
router.post(
  "/carriers/:id/pickups",
  requirePermission("shipping", "create"),
  createPickupValidator,
  createCarrierPickup,
);
router.delete(
  "/carriers/:id/pickups/:pickupId",
  requirePermission("shipping", "delete"),
  pickupIdParamValidator,
  deleteCarrierPickup,
);
router.put(
  "/carriers/:id/pickups/:pickupId/default",
  requirePermission("shipping", "update"),
  pickupIdParamValidator,
  setDefaultCarrierPickup,
);
router.get(
  "/carriers/:id/bosta/districts-lookup",
  requirePermission("shipping", "read"),
  carrierPickupParamValidator,
  getBostaDistrictsLookup,
);

router.get(
  "/shipping/orders/:id",
  requirePermission("shipping", "read"),
  orderShippingDetailValidator,
  getOrderShippingDetail,
);
router.patch(
  "/shipping/orders/:id/status",
  requirePermission("shipping", "update"),
  updateManualOrderShippingStatusValidator,
  updateManualOrderShippingStatus,
);
router.post(
  "/shipping/orders/:id/assign",
  requirePermission("shipping", "create"),
  assignOrderShippingValidator,
  assignOrderShipping,
);

export default router;
