// src/routes/order.routes.js
import { Router } from "express";
import {
  createOrder,
  getMyOrders,
  getMyOrder,
  getOrders,
  getOrder,
  updateOrderStatus,
  refundOrder,
} from "../controllers/order.controller.js";
import {
  createPaymentSession,
  getPaymentSessionStatus,
} from "../controllers/payment.controller.js";
import {
  createOrderValidator,
  createPaymentSessionValidator,
  paymentSessionIdParamValidator,
  orderIdParamValidator,
  updateOrderStatusValidator,
  refundOrderValidator,
} from "../validators/order.validator.js";
import { protectedRoutes, allowTo } from "../middlewares/auth.middleware.js";

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

router.use(allowTo("admin"));

router.get("/", getOrders);
router.post("/:id/refund", refundOrderValidator, refundOrder);
router.patch("/:id/status", updateOrderStatusValidator, updateOrderStatus);
router.get("/:id", orderIdParamValidator, getOrder);

export default router;
