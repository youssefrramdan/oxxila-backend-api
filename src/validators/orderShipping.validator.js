// src/validators/orderShipping.validator.js
import { body, param } from "express-validator";
import validate from "../middlewares/validate.middleware.js";
import Carrier from "../models/Carrier.js";

export const assignOrderShippingValidator = [
  param("id").isMongoId().withMessage("Invalid order ID"),
  body("carrierId").isMongoId().withMessage("carrierId is required"),
  body("driverName").optional().isString(),
  body("driverPhone").optional().isString(),
  body("trackingNumber").optional().isString(),
  body("notes").optional().isString(),
  body("markShipped").optional().isBoolean(),
  body("allowToOpenPackage").optional().isBoolean(),
  body("size")
    .optional()
    .isIn(["SMALL", "MEDIUM", "LARGE", "XLARGE"])
    .withMessage("size must be SMALL, MEDIUM, LARGE, or XLARGE"),
  body("pickupId")
    .optional()
    .isMongoId()
    .withMessage("Invalid pickup id"),
  body("pickupId").custom(async (pickupId, { req }) => {
    const carrier = await Carrier.findById(req.body.carrierId).select("type apiProvider");
    if (carrier?.type === "api" && carrier.apiProvider === "bosta" && !pickupId) {
      throw new Error("pickupId is required when assigning a Bosta API carrier");
    }
    return true;
  }),
  validate,
];

export const orderShippingDetailValidator = [
  param("id").isMongoId().withMessage("Invalid order ID"),
  validate,
];

export const updateManualOrderShippingStatusValidator = [
  param("id").isMongoId().withMessage("Invalid order ID"),
  body("orderStatus")
    .notEmpty()
    .withMessage("orderStatus is required")
    .isIn([
      "processing",
      "shipped",
      "out_for_delivery",
      "failed_attempt",
      "delivered",
      "returned",
      "cancelled",
    ])
    .withMessage("Invalid manual order status"),
  body("notes").optional().isString().isLength({ max: 500 }),
  validate,
];
