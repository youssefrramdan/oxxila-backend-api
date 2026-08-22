// src/routes/return.routes.js
import { Router } from "express";
import createUploader from "../middlewares/cloudnairyMiddleware.js";
import { parseReturnBody } from "../middlewares/parseReturnBody.middleware.js";
import { protectedRoutes, allowTo } from "../middlewares/auth.middleware.js";
import { requirePermission } from "../middlewares/permission.middleware.js";
import {
  getEligibleReturnOrders,
  createReturnRequest,
  getMyReturns,
  getMyReturn,
  getReturns,
  getReturn,
  updateReturnStatus,
  refundReturnAsGift,
  scheduleBostaReturn,
} from "../controllers/return.controller.js";
import {
  createReturnValidator,
  returnIdParamValidator,
  updateReturnStatusValidator,
  listReturnsQueryValidator,
} from "../validators/return.validator.js";

const router = Router();

const returnUpload = createUploader("oxxila/returns", {
  allowedFormats: ["jpeg", "jpg", "png", "webp"],
  maxFileSizeMB: 5,
});

router.use(protectedRoutes);

router.get("/eligible-orders", getEligibleReturnOrders);
router.post(
  "/",
  returnUpload.fields([{ name: "proofImages", maxCount: 5 }]),
  parseReturnBody,
  createReturnValidator,
  createReturnRequest,
);
router.get("/my-returns", listReturnsQueryValidator, getMyReturns);
router.get("/my-returns/:id", returnIdParamValidator, getMyReturn);

router.use(allowTo("admin"));

router.get(
  "/",
  requirePermission("returns", "read"),
  listReturnsQueryValidator,
  getReturns,
);
router.patch(
  "/:id/status",
  requirePermission("returns", "update"),
  updateReturnStatusValidator,
  updateReturnStatus,
);
router.post(
  "/:id/refund-as-gift",
  requirePermission("returns", "update"),
  returnIdParamValidator,
  refundReturnAsGift,
);
router.post(
  "/:id/bosta/schedule",
  requirePermission("returns", "update"),
  returnIdParamValidator,
  scheduleBostaReturn,
);
router.get(
  "/:id",
  requirePermission("returns", "read"),
  returnIdParamValidator,
  getReturn,
);

export default router;
