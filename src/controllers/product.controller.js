// src/controllers/product.controller.js
import asyncHandler from 'express-async-handler';
import mongoose from 'mongoose';
import Product from '../models/Product.js';
import User from '../models/User.js';
import ApiError from '../utils/apiError.js';
import ApiFeatures from '../utils/apiFeatures.js';
import sendResponse from '../utils/apiResponse.js';
import { productPopulate, productSelect } from '../utils/populate/productPopulate.js';

/** Mongo filter for active (listed) products */
const activeFilter = { isActive: true };

/** Upsert a product view into the user's browsing history (max 20) */
const addToBrowsingHistory = async (userId, productId, categoryId) => {
  const pid =
    productId instanceof mongoose.Types.ObjectId
      ? productId
      : new mongoose.Types.ObjectId(String(productId));

  const updated = await User.findOneAndUpdate(
    { _id: userId, 'browsingHistory.product': pid },
    { $set: { 'browsingHistory.$.viewedAt': new Date() } }
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
  const filter = { ...activeFilter };

  if (query.category && mongoose.Types.ObjectId.isValid(query.category)) {
    filter.category = query.category;
  }
  if (query.subCategory) {
    const ids = query.subCategory.split(',').filter((id) => mongoose.Types.ObjectId.isValid(id));
    if (ids.length) filter.subCategory = { $in: ids };
  }
  if (query.brand && mongoose.Types.ObjectId.isValid(query.brand)) {
    filter.brand = query.brand;
  }
  if (query.concerns) {
    filter.concerns = { $in: query.concerns.split(',') };
  }
  if (query.isSensitiveSkin !== undefined) {
    filter.isSensitiveSkin = query.isSensitiveSkin === 'true';
  }
  if (query.isCertified !== undefined) {
    filter.isCertified = query.isCertified === 'true';
  }
  if (query.isBestSeller !== undefined) {
    filter.isBestSeller = query.isBestSeller === 'true';
  }
  if (query.isBundle !== undefined) {
    filter.isBundle = query.isBundle === 'true';
  }
  if (query.priceMin || query.priceMax) {
    filter.price = {};
    if (query.priceMin) filter.price.$gte = Number(query.priceMin);
    if (query.priceMax) filter.price.$lte = Number(query.priceMax);
  }

  const now = new Date();

  if (query.allOffers === 'true') {
    filter.priceAfterDiscount = { $ne: null };
    filter.offerEndsAt = { $gt: now };
  }

  if (query.todayOffers === 'true') {
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);
    filter.priceAfterDiscount = { $ne: null };
    filter.offerEndsAt = { $lte: endOfDay, $gt: now };
  }

  // inverse of active offer: no discount set, or offer window missing/expired
  if (query.noOffers === 'true') {
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

  const safeQuery = { ...req.query };
  ['category', 'subCategory', 'brand', 'concerns', 'isSensitiveSkin',
    'isCertified', 'isBestSeller', 'isBundle', 'priceMin', 'priceMax', 'isActive',
    'allOffers', 'todayOffers', 'noOffers']
     .forEach((k) => delete safeQuery[k]);

  const features = new ApiFeatures(
    Product.find(filter).select(productSelect).populate(productPopulate),
    safeQuery
  )
    .search(['name'])
    .sort();

  await features.paginate();

  const products = await features.mongooseQuery.lean();

  sendResponse(res, {
    message: 'Products retrieved successfully',
    pagination: { ...features.getPaginationResult(), results: products.length },
    data: products,
  });
});

/**
 * @desc    Get one product
 * @route   GET /api/v1/products/:id
 * @access  Public
 */
export const getProduct = asyncHandler(async (req, res, next) => {
  const product = await Product.findOne({ _id: req.params.id, ...activeFilter })
    .select(`${productSelect} description advantages composition catalog`)
    .populate(productPopulate);

  if (!product) return next(new ApiError(`No product found with id: ${req.params.id}`, 404));

  const categoryId =
    product.category != null && typeof product.category === 'object' && '_id' in product.category
      ? product.category._id
      : product.category;

  // fire and forget
  Product.findByIdAndUpdate(req.params.id, { $inc: { views: 1 } }).catch(() => {});
  if (req.user) {
    addToBrowsingHistory(req.user._id, product._id, categoryId).catch(() => {});
  }

  sendResponse(res, { message: 'Product retrieved successfully', data: product });
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

  const product = await Product.create(req.body);
  const populated = await product.populate(productPopulate);

  sendResponse(res, { statusCode: 201, message: 'Product created successfully', data: populated });
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
  if ('certificationImage' in req.body) {
    req.body.isCertified = !!req.body.certificationImage;
  }

  const product = await Product.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  }).populate(productPopulate);

  if (!product) return next(new ApiError(`No product found with id: ${req.params.id}`, 404));

  sendResponse(res, { message: 'Product updated successfully', data: product });
});

/**
 * @desc    Delete product
 * @route   DELETE /api/v1/products/:id
 * @access  Private (admin)
 */
export const deleteProduct = asyncHandler(async (req, res, next) => {
  const product = await Product.findById(req.params.id);
  if (!product) return next(new ApiError(`No product found with id: ${req.params.id}`, 404));

  await product.deleteOne();
  sendResponse(res, { message: 'Product deleted successfully' });
});

/**
 * @desc    Toggle best seller status
 * @route   PATCH /api/v1/products/:id/best-seller
 * @access  Private (admin)
 */
export const toggleBestSeller = asyncHandler(async (req, res, next) => {
  const product = await Product.findById(req.params.id);
  if (!product) return next(new ApiError(`No product found with id: ${req.params.id}`, 404));

  product.isBestSeller = !product.isBestSeller;
  await product.save();

  sendResponse(res, {
    message: `Product ${product.isBestSeller ? 'marked as' : 'removed from'} best seller`,
    data: { isBestSeller: product.isBestSeller },
  });
});
