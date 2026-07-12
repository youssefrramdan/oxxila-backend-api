// src/routes/return.routes.js
import { Router } from "express";
import createUploader from "../middlewares/cloudnairyMiddleware.js";
import { parseReturnBody } from "../middlewares/parseReturnBody.middleware.js";
import { protectedRoutes, allowTo } from "../middlewares/auth.middleware.js";
import {
  getEligibleReturnOrders,
  createReturnRequest,
  getMyReturns,
  getMyReturn,
  getReturns,
  getReturn,
  updateReturnStatus,
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

router.get("/", listReturnsQueryValidator, getReturns);
router.patch("/:id/status", updateReturnStatusValidator, updateReturnStatus);
router.post("/:id/bosta/schedule", returnIdParamValidator, scheduleBostaReturn);
router.get("/:id", returnIdParamValidator, getReturn);

export default router;
