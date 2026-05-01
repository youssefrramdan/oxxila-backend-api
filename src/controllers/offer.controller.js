// src/controllers/offer.controller.js
import asyncHandler from 'express-async-handler';
import Offer from '../models/Offer.js';
import Product from '../models/Product.js';
import ApiError from '../utils/apiError.js';
import sendResponse from '../utils/apiResponse.js';

const PRODUCT_ON_CARD = 'name slug price images isBundle';
const PRODUCT_MINIMAL = 'name slug price images';

const popProduct = (fields) => ({ path: 'product', select: fields });

const productIdOf = (ref) => String(ref?._id ?? ref ?? '');

/** Another non-expired active offer on this product (optional `excludeOfferId` for updates). */
const findBlockingOffer = (productId, excludeOfferId) => {
  const filter = { product: productId, isActive: true, endDate: { $gt: new Date() } };
  if (excludeOfferId) filter._id = { $ne: excludeOfferId };
  return Offer.findOne(filter);
};

const syncProductOffer = async (productRef, offer = null) => {
  const id = productRef?._id ?? productRef;
  if (!id) return;

  if (!offer) {
    await Product.findByIdAndUpdate(id, { $set: { priceAfterDiscount: null, offerEndsAt: null } });
    return;
  }

  const product = await Product.findById(id);
  if (!product) return;

  const discount =
    offer.discountPercent != null ? (product.price * offer.discountPercent) / 100 : offer.discountAmount;

  await Product.findByIdAndUpdate(id, {
    $set: {
      priceAfterDiscount: +Math.max(product.price - discount, 0).toFixed(2),
      offerEndsAt: offer.endDate,
    },
  });
};

/**
 * @desc    List current offers (optionally ending today)
 * @route   GET /api/v1/offers
 * @access  Public
 */
export const getAllOffers = asyncHandler(async (req, res) => {
  const now = new Date();
  const filter = { isActive: true, startDate: { $lte: now }, endDate: { $gt: now } };

  if (req.query.todayOffers === 'true') {
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);
    filter.endDate = { $lte: endOfToday, $gt: now };
  }

  const data = await Offer.find(filter).populate(popProduct(PRODUCT_ON_CARD)).sort({ endDate: 1 }).lean();
  sendResponse(res, { message: 'Offers retrieved successfully', data });
});

/**
 * @desc    Nearest upcoming offer
 * @route   GET /api/v1/offers/upcoming
 * @access  Public
 */
export const getUpcomingOffer = asyncHandler(async (req, res) => {
  const now = new Date();
  const data = await Offer.findOne({ isActive: true, startDate: { $gt: now } })
    .populate(popProduct(PRODUCT_MINIMAL))
    .sort({ startDate: 1 })
    .lean();

  sendResponse(res, { message: 'Upcoming offer retrieved successfully', data });
});

/**
 * @desc    Get one offer
 * @route   GET /api/v1/offers/:id
 * @access  Public
 */
export const getOffer = asyncHandler(async (req, res, next) => {
  const data = await Offer.findById(req.params.id).populate(popProduct(PRODUCT_ON_CARD));
  if (!data) return next(new ApiError(`No offer found with id: ${req.params.id}`, 404));

  sendResponse(res, { message: 'Offer retrieved successfully', data });
});

/**
 * @desc    Create offer
 * @route   POST /api/v1/offers
 * @access  Private (admin)
 */
export const createOffer = asyncHandler(async (req, res, next) => {
  const { product: productId } = req.body;

  if (!(await Product.findById(productId))) {
    return next(new ApiError(`No product found with id: ${productId}`, 404));
  }
  if (await findBlockingOffer(productId)) {
    return next(new ApiError('This product already has an active offer', 400));
  }

  const data = await Offer.create(req.body);
  await syncProductOffer(data.product, data);
  await data.populate(popProduct(PRODUCT_ON_CARD));

  sendResponse(res, { statusCode: 201, message: 'Offer created successfully', data });
});

/**
 * @desc    Update offer
 * @route   PUT /api/v1/offers/:id
 * @access  Private (admin)
 */
export const updateOffer = asyncHandler(async (req, res, next) => {
  const doc = await Offer.findById(req.params.id);
  if (!doc) return next(new ApiError(`No offer found with id: ${req.params.id}`, 404));

  const prevProductId = doc.product.toString();
  const nextProductId = req.body.product ?? prevProductId;

  if (nextProductId !== prevProductId && (await findBlockingOffer(nextProductId, doc._id))) {
    return next(new ApiError('This product already has an active offer', 400));
  }

  Object.assign(doc, req.body);
  await doc.save();
  await doc.populate(popProduct(PRODUCT_ON_CARD));

  if (prevProductId !== productIdOf(doc.product)) {
    await syncProductOffer(prevProductId, null);
  }
  await syncProductOffer(doc.product, doc);

  sendResponse(res, { message: 'Offer updated successfully', data: doc });
});

/**
 * @desc    Delete offer
 * @route   DELETE /api/v1/offers/:id
 * @access  Private (admin)
 */
export const deleteOffer = asyncHandler(async (req, res, next) => {
  const removed = await Offer.findOneAndDelete({ _id: req.params.id });
  if (!removed) return next(new ApiError(`No offer found with id: ${req.params.id}`, 404));

  await syncProductOffer(removed.product, null);
  sendResponse(res, { message: 'Offer deleted successfully' });
});

/**
 * @desc    Delete every offer and clear synced prices on affected products
 * @route   DELETE /api/v1/offers
 * @access  Private (admin)
 */
export const deleteAllOffers = asyncHandler(async (req, res) => {
  const productIds = await Offer.distinct('product');
  const { deletedCount } = await Offer.deleteMany({});

  await Promise.all(productIds.map((id) => syncProductOffer(id, null)));

  sendResponse(res, {
    message: 'All offers deleted successfully',
    data: { deletedCount },
  });
});
