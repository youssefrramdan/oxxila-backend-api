// src/validators/return.validator.js
import { body, param, query } from "express-validator";
import validate from "../middlewares/validate.middleware.js";
import {
  PROOF_REQUIRED_REASONS,
  getReturnProofUploads,
} from "../controllers/return.controller.js";

const mongoId = (field, location = "param") =>
  location === "param"
    ? param(field).isMongoId().withMessage(`Invalid ${field}`)
    : body(field).isMongoId().withMessage(`Invalid ${field}`);

const pickupAddressRules = [
  body("pickupAddress.firstLine")
    .trim()
    .notEmpty()
    .withMessage("pickupAddress.firstLine is required")
    .isLength({ max: 500 }),
  body("pickupAddress.city")
    .trim()
    .notEmpty()
    .withMessage("pickupAddress.city is required"),
  body("pickupAddress.governorateName")
    .trim()
    .notEmpty()
    .withMessage("pickupAddress.governorateName is required"),
  body("pickupAddress.secondLine").optional().trim().isLength({ max: 200 }),
  body("pickupAddress.governorateId").optional().isMongoId(),
  body("pickupAddress.districtId")
    .optional()
    .custom((value) => {
      if (value == null || value === "" || value === "other") return true;
      if (typeof value === "string" && /^[a-f\d]{24}$/i.test(value))
        return true;
      throw new Error("Invalid pickupAddress.districtId");
    }),
  body("pickupAddress.districtName").optional().trim().isLength({ max: 120 }),
];

const isReturnLineId = (value) => {
  const v = String(value ?? "").trim();
  if (/^[a-f\d]{24}$/i.test(v)) return true;
  if (/^idx:\d+$/.test(v)) return true;
  if (/^\d+$/.test(v)) return true;
  return false;
};

export const createReturnValidator = [
  body("order").trim().isMongoId().withMessage("Invalid order id"),
  body("items")
    .isArray({ min: 1 })
    .withMessage("items must be a non-empty array"),
  body("items.*.orderItemId").custom((value) => {
    if (!isReturnLineId(value)) throw new Error("Invalid orderItemId");
    return true;
  }),
  body("items.*.quantity")
    .toInt()
    .isInt({ min: 1 })
    .withMessage("quantity must be at least 1"),
  body("reason")
    .notEmpty()
    .isIn([
      "damaged_item",
      "wrong_product",
      "allergic_reaction",
      "expired_product",
      "changed_mind",
      "other",
    ]),
  body("note").optional().trim().isLength({ max: 1000 }),
  body("contactPhone").optional().trim().isLength({ max: 20 }),
  ...pickupAddressRules,
  body().custom((_, { req }) => {
    if (
      PROOF_REQUIRED_REASONS.has(req.body.reason) &&
      getReturnProofUploads(req).length === 0
    ) {
      throw new Error("Proof images are required for this return reason");
    }
    return true;
  }),
  validate,
];

export const returnIdParamValidator = [mongoId("id"), validate];

export const updateReturnStatusValidator = [
  mongoId("id"),
  body("refundStatus")
    .notEmpty()
    .isIn(["approved", "picked_up", "received", "refunded", "rejected"]),
  body("logisticsHandler").optional().isIn(["bosta", "internal"]),
  body("carrierId").optional().isMongoId(),
  body("dropOffPickupId").optional().isMongoId(),
  body("adminNote").optional().trim().isLength({ max: 500 }),
  body().custom((_, { req }) => {
    if (req.body.refundStatus === "approved") {
      if (!["bosta", "internal"].includes(req.body.logisticsHandler)) {
        throw new Error(
          "logisticsHandler (bosta or internal) is required when approving",
        );
      }
      if (req.body.logisticsHandler === "bosta") {
        if (!req.body.carrierId)
          throw new Error("carrierId is required for Bosta logistics");
        if (!req.body.dropOffPickupId) {
          throw new Error("dropOffPickupId is required for Bosta logistics");
        }
      }
    }
    if (req.body.refundStatus === "rejected" && !req.body.adminNote?.trim()) {
      throw new Error("adminNote is recommended when rejecting a return");
    }
    return true;
  }),
  validate,
];

export const listReturnsQueryValidator = [
  query("refundStatus")
    .optional()
    .isIn([
      "pending",
      "approved",
      "picked_up",
      "received",
      "refunded",
      "rejected",
    ]),
  validate,
];
