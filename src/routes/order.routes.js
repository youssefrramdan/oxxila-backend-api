// src/routes/order.routes.js
import { Router } from "express";
import {
  createOrder,
  createOrderB2B,
  getMyOrders,
  getMyOrder,
  getOrders,
  getOrder,
  updateOrderStatus,
  refundOrder,
  cancelOrder,
} from "../controllers/order.controller.js";
import {
  createPaymentSession,
  getPaymentSessionStatus,
} from "../controllers/payment.controller.js";
import {
  createOrderValidator,
  createOrderB2BValidator,
  createPaymentSessionValidator,
  paymentSessionIdParamValidator,
  orderIdParamValidator,
  updateOrderStatusValidator,
  refundOrderValidator,
  cancelOrderValidator,
} from "../validators/order.validator.js";
import { protectedRoutes, allowTo } from "../middlewares/auth.middleware.js";
import { requirePermission } from "../middlewares/permission.middleware.js";

const router = Router();

router.use(protectedRoutes);

router.post(
  "/payment-session",
  createPaymentSessionValidator,
  createPaymentSession,
);
router.get(
  "/payment-session/:id",
  paymentSessionIdParamValidator,
  getPaymentSessionStatus,
);
router.post("/", createOrderValidator, createOrder);
router.get("/my-orders", getMyOrders);
router.get("/my-orders/:id", orderIdParamValidator, getMyOrder);
router.patch("/:id/cancel", cancelOrderValidator, cancelOrder);

router.use(allowTo("admin"));

router.get("/", requirePermission("orders", "read"), getOrders);
router.post(
  "/b2b",
  requirePermission("orders", "create"),
  createOrderB2BValidator,
  createOrderB2B,
);
router.post(
  "/:id/refund",
  requirePermission("orders", "update"),
  refundOrderValidator,
  refundOrder,
);
router.patch(
  "/:id/status",
  requirePermission("orders", "update"),
  updateOrderStatusValidator,
  updateOrderStatus,
);
router.get("/:id", requirePermission("orders", "read"), orderIdParamValidator, getOrder);

export default router;
