// src/validators/orderShipping.validator.js
import { body, param } from "express-validator";
import validate from "../middlewares/validate.middleware.js";

export const assignOrderShippingValidator = [
  param("id").isMongoId().withMessage("Invalid order ID"),
  body("carrierId").isMongoId().withMessage("carrierId is required"),
  body("driverName").optional().isString(),
  body("driverPhone").optional().isString(),
  body("trackingNumber").optional().isString(),
  body("notes").optional().isString(),
  body("markShipped").optional().isBoolean(),
  body("size")
    .optional()
    .isIn(["SMALL", "MEDIUM", "LARGE", "XLARGE"])
    .withMessage("size must be SMALL, MEDIUM, LARGE, or XLARGE"),
  body("pickupId").optional().isMongoId().withMessage("Invalid pickup id"),
  validate,
];

export const orderShippingDetailValidator = [
  param("id").isMongoId().withMessage("Invalid order ID"),
  validate,
];
1
