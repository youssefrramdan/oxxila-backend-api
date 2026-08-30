// src/controllers/product.controller.js
import asyncHandler from "express-async-handler";
import mongoose from "mongoose";
import Order from "../models/Order.js";
import Product from "../models/Product.js";
import User from "../models/User.js";
import ApiError from "../utils/apiError.js";
import ApiFeatures from "../utils/apiFeatures.js";
import sendResponse from "../utils/apiResponse.js";
import {
  productPopulate,
  productSelect,
} from "../utils/populate/productPopulate.js";
import {
  attachAuditToDoc,
  logAdminCreate,
  logAdminDelete,
  logAdminUpdate,
  stampAuditFields,
  withAuditPopulate,
} from "../utils/adminActivity.js";
import { refreshProductOffers } from "../utils/productOffer.js";

/** Mongo filter for active (listed) products */
const activeFilter = { isActive: true };

const DEFAULT_PERFORMANCE_PERIOD_DAYS = 30;
const PAID_ORDER_MATCH = {
  paymentStatus: "paid",
  orderStatus: { $nin: ["cancelled"] },
};

const roundPercent = (value) => Math.round(value * 10) / 10;

const parsePositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const startOfUtcDay = (date) =>
  new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );

const shiftDays = (date, days) => {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
};

/** Current + previous equal-length windows for period-over-period comparison */
const periodBounds = (days) => {
  const end = new Date();
  const currentStart = shiftDays(startOfUtcDay(end), -(days - 1));
  const previousEnd = shiftDays(currentStart, -1);
  const previousStart = shiftDays(startOfUtcDay(previousEnd), -(days - 1));
  return { currentStart, end, previousStart, previousEnd };
};

const calcTrend = (current, previous) => {
  if (previous === 0) return current > 0 ? 100 : 0;
  return roundPercent(((current - previous) / previous) * 100);
};

/** Units sold per product in current vs previous period (for PERFORMANCE column) */
const buildPerformanceByProductId = async (productIds, days) => {
  const map = new Map(productIds.map((id) => [String(id), 0]));
  if (!productIds.length) return map;

  const { currentStart, end, previousStart, previousEnd } = periodBounds(days);

  const rows = await Order.aggregate([
    {
      $match: {
        ...PAID_ORDER_MATCH,
        createdAt: { $gte: previousStart, $lte: end },
        "items.product": { $in: productIds },
      },
    },
    { $unwind: "$items" },
    { $match: { "items.product": { $in: productIds } } },
    {
      $group: {
        _id: "$items.product",
        current: {
          $sum: {
            $cond: [
              { $gte: ["$createdAt", currentStart] },
              "$items.quantity",
              0,
            ],
          },
        },
        previous: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $gte: ["$createdAt", previousStart] },
                  { $lte: ["$createdAt", previousEnd] },
                ],
              },
              "$items.quantity",
              0,
            ],
          },
        },
      },
    },
  ]);

  for (const row of rows) {
    map.set(String(row._id), calcTrend(row.current, row.previous));
  }
  return map;
};

/** Upsert a product view into the user's browsing history (max 20) */
const addToBrowsingHistory = async (userId, productId, categoryId) => {
  const pid =
    productId instanceof mongoose.Types.ObjectId
      ? productId
      : new mongoose.Types.ObjectId(String(productId));

  const updated = await User.findOneAndUpdate(
    { _id: userId, "browsingHistory.product": pid },
    { $set: { "browsingHistory.$.viewedAt": new Date() } },
  );

  if (!updated) {
    await User.findByIdAndUpdate(userId, {
      $push: {
        browsingHistory: {
          $each: [{ product: pid, category: categoryId, viewedAt: new Date() }],
          $position: 0,
          $slice: 20,
        },
      },
    });
  }
};

/** Build a Mongo filter from public product list query params */
const buildFilter = (query) => {
  const filter = {};

  // Default active-only for storefront. Admin catalog can pass isActive=false|all.
  if (query.isActive === "false") {
    filter.isActive = false;
  } else if (query.isActive !== "all") {
    filter.isActive = true;
  }

  if (query.category && mongoose.Types.ObjectId.isValid(query.category)) {
    filter.category = query.category;
  }
  if (query.subCategory) {
    const ids = query.subCategory
      .split(",")
      .filter((id) => mongoose.Types.ObjectId.isValid(id));
    if (ids.length) filter.subCategory = { $in: ids };
  }
  if (query.brand && mongoose.Types.ObjectId.isValid(query.brand)) {
    filter.brand = query.brand;
  }
  if (query.concerns) {
    filter.concerns = { $in: query.concerns.split(",") };
  }
  if (query.isSensitiveSkin !== undefined) {
    filter.isSensitiveSkin = query.isSensitiveSkin === "true";
  }
  if (query.isCertified !== undefined) {
    filter.isCertified = query.isCertified === "true";
  }
  if (query.isBestSeller !== undefined) {
    filter.isBestSeller = query.isBestSeller === "true";
  }
  if (query.isBundle !== undefined) {
    filter.isBundle = query.isBundle === "true";
  }
  if (query.priceMin || query.priceMax) {
    filter.price = {};
    if (query.priceMin) filter.price.$gte = Number(query.priceMin);
    if (query.priceMax) filter.price.$lte = Number(query.priceMax);
  }

  const now = new Date();

  if (query.allOffers === "true") {
    filter.priceAfterDiscount = { $ne: null };
    filter.offerEndsAt = { $gt: now };
  }

  if (query.todayOffers === "true") {
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);
    filter.priceAfterDiscount = { $ne: null };
    filter.offerEndsAt = { $lte: endOfDay, $gt: now };
  }

  // inverse of active offer: no discount set, or offer window missing/expired
  if (query.noOffers === "true") {
    filter.$or = [
      { priceAfterDiscount: null },
      { offerEndsAt: null },
      { offerEndsAt: { $lte: now } },
    ];
  }

  return filter;
};
/**
 * @desc    List products
 * @route   GET /api/v1/products
 * @access  Public
 */
export const getAllProducts = asyncHandler(async (req, res) => {
  const filter = buildFilter(req.query);
  const periodDays = parsePositiveInt(
    req.query.period,
    DEFAULT_PERFORMANCE_PERIOD_DAYS,
  );

  const safeQuery = { ...req.query };
  [
    "category",
    "subCategory",
    "brand",
    "concerns",
    "isSensitiveSkin",
    "isCertified",
    "isBestSeller",
    "isBundle",
    "priceMin",
    "priceMax",
    "isActive",
    "allOffers",
    "todayOffers",
    "noOffers",
    "period",
  ].forEach((k) => delete safeQuery[k]);

  const features = new ApiFeatures(
    Product.find(filter).select(productSelect).populate(productPopulate),
    safeQuery,
  )
    .search(["name"])
    .sort();

  await features.paginate();

  const products = await features.mongooseQuery.lean();
  await refreshProductOffers(products);

  const performanceById = await buildPerformanceByProductId(
    products.map((p) => p._id),
    periodDays,
  );

  const data = products.map((product) => ({
    ...product,
    performance: performanceById.get(String(product._id)) ?? 0,
  }));

  sendResponse(res, {
    message: "Products retrieved successfully",
    pagination: { ...features.getPaginationResult(), results: data.length },
    data,
  });
});

/**
 * @desc    Get one product
 * @route   GET /api/v1/products/:id
 * @access  Public
 */
export const getProduct = asyncHandler(async (req, res, next) => {
  // Admins can open archived formulas; storefront stays active-only.
  const filter =
    req.user?.role === "admin"
      ? { _id: req.params.id }
      : { _id: req.params.id, ...activeFilter };

  const product = await Product.findOne(filter)
    .select(`${productSelect} description advantages composition catalog`)
    .populate(productPopulate);

  if (!product)
    return next(
      new ApiError(`No product found with id: ${req.params.id}`, 404),
    );

  await refreshProductOffers(product);

  const categoryId =
    product.category != null &&
    typeof product.category === "object" &&
    "_id" in product.category
      ? product.category._id
      : product.category;

  // fire and forget
  Product.findByIdAndUpdate(req.params.id, { $inc: { views: 1 } }).catch(
    () => {},
  );
  if (req.user) {
    addToBrowsingHistory(req.user._id, product._id, categoryId).catch(() => {});
  }

  sendResponse(res, {
    message: "Product retrieved successfully",
    data: product,
  });
});

/**
 * @desc    Create product
 * @route   POST /api/v1/products
 * @access  Private (admin)
 */
export const createProduct = asyncHandler(async (req, res) => {
  if (req.files?.images) {
    req.body.images = req.files.images.map((f) => f.path);
  }
  if (req.files?.certificationImage?.[0]) {
    req.body.certificationImage = req.files.certificationImage[0].path;
  }
  if (req.files?.catalog?.[0]) {
    req.body.catalog = req.files.catalog[0].path;
  }

  stampAuditFields(req.body, req, { isCreate: true });
  const product = await Product.create(req.body);
  logAdminCreate(req, {
    tab: "products",
    resourceType: "product",
    doc: product,
  });
  const populated = await withAuditPopulate(
    Product.findById(product._id)
      .select(productSelect)
      .populate(productPopulate),
  );

  sendResponse(res, {
    statusCode: 201,
    message: "Product created successfully",
    data: attachAuditToDoc(populated),
  });
});

/**
 * @desc    Update product
 * @route   PUT /api/v1/products/:id
 * @access  Private (admin)
 */
export const updateProduct = asyncHandler(async (req, res, next) => {
  if (req.files?.images) {
    req.body.images = req.files.images.map((f) => f.path);
  }
  if (req.files?.certificationImage?.[0]) {
    req.body.certificationImage = req.files.certificationImage[0].path;
  }
  if (req.files?.catalog?.[0]) {
    req.body.catalog = req.files.catalog[0].path;
  }

  // ensure isCertified stays in sync
  if ("certificationImage" in req.body) {
    req.body.isCertified = !!req.body.certificationImage;
  }

  const previous = await Product.findById(req.params.id).lean();
  if (!previous)
    return next(
      new ApiError(`No product found with id: ${req.params.id}`, 404),
    );

  stampAuditFields(req.body, req);
  const product = await Product.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  }).populate(productPopulate);

  logAdminUpdate(req, {
    tab: "products",
    resourceType: "product",
    doc: product,
    previous,
  });

  sendResponse(res, {
    message: "Product updated successfully",
    data: attachAuditToDoc(
      await withAuditPopulate(
        Product.findById(product._id).populate(productPopulate),
      ),
    ),
  });
});

/**
 * @desc    Delete product
 * @route   DELETE /api/v1/products/:id
 * @access  Private (admin)
 */
export const deleteProduct = asyncHandler(async (req, res, next) => {
  const product = await Product.findById(req.params.id);
  if (!product)
    return next(
      new ApiError(`No product found with id: ${req.params.id}`, 404),
    );

  const productId = product._id;

  logAdminDelete(req, {
    tab: "products",
    resourceType: "product",
    doc: product,
  });
  await product.deleteOne();

  // Remove orphaned history entries so previously-browsed carousels stay clean.
  await User.updateMany(
    { "browsingHistory.product": productId },
    { $pull: { browsingHistory: { product: productId } } },
  );

  sendResponse(res, { message: "Product deleted successfully" });
});

/**
 * @desc    Toggle best seller status
 * @route   PATCH /api/v1/products/:id/best-seller
 * @access  Private (admin)
 */
export const toggleBestSeller = asyncHandler(async (req, res, next) => {
  const product = await Product.findById(req.params.id);
  if (!product)
    return next(
      new ApiError(`No product found with id: ${req.params.id}`, 404),
    );

  const previous = product.toObject();
  product.isBestSeller = !product.isBestSeller;
  stampAuditFields(product, req);
  await product.save();

  logAdminUpdate(req, {
    tab: "products",
    resourceType: "product",
    doc: product,
    previous,
  });

  sendResponse(res, {
    message: `Product ${product.isBestSeller ? "marked as" : "removed from"} best seller`,
    data: { isBestSeller: product.isBestSeller },
  });
});
