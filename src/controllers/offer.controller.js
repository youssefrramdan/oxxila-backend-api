// src/controllers/offer.controller.js
import asyncHandler from 'express-async-handler';
import Offer from '../models/Offer.js';
import Product from '../models/Product.js';
import ApiError from '../utils/apiError.js';
import sendResponse from '../utils/apiResponse.js';

const offerPopulate = { path: 'product', select: 'name slug price priceAfterDiscount images' };

/**
 * @desc    Get all offers
 * @route   GET /api/v1/offers
 * @access  Public
 */
export const getAllOffers = asyncHandler(async (req, res) => {
  const now = new Date();
  const filter = { isActive: true, endDate: { $gt: now } };

  // Today offers
  if (req.query.todayOffers === 'true') {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);
    filter.endDate = { $gte: startOfDay, $lte: endOfDay };
  }

  const offers = await Offer.find(filter)
    .populate(offerPopulate)
    .sort({ createdAt: -1 });

  sendResponse(res, { message: 'Offers retrieved successfully', data: offers });
});

/**
 * @desc    Get one offer
 * @route   GET /api/v1/offers/:id
 * @access  Public
 */
export const getOffer = asyncHandler(async (req, res, next) => {
  const offer = await Offer.findById(req.params.id).populate(offerPopulate);
  if (!offer) return next(new ApiError(`No offer found with id: ${req.params.id}`, 404));
  sendResponse(res, { message: 'Offer retrieved successfully', data: offer });
});

/**
 * @desc    Create offer
 * @route   POST /api/v1/offers
 * @access  Private (admin)
 */
export const createOffer = asyncHandler(async (req, res, next) => {
  const { product, discountPercent, discountAmount, startDate, endDate, productCount } = req.body;

  const existingProduct = await Product.findById(product);
  if (!existingProduct) return next(new ApiError(`No product found with id: ${product}`, 404));

  const existingOffer = await Offer.findOne({ product, isActive: true, endDate: { $gt: new Date() } });
  if (existingOffer) return next(new ApiError('This product already has an active offer', 400));

  if (!discountPercent && !discountAmount) {
    return next(new ApiError('Either discountPercent or discountAmount is required', 400));
  }

  const offer = await Offer.create({
    product,
    discountPercent: discountPercent || null,
    discountAmount: discountAmount || null,
    productCount: productCount || null,
    startDate,
    endDate,
  });

  sendResponse(res, { statusCode: 201, message: 'Offer created successfully', data: offer });
});

/**
 * @desc    Update offer
 * @route   PUT /api/v1/offers/:id
 * @access  Private (admin)
 */
export const updateOffer = asyncHandler(async (req, res, next) => {
  const offer = await Offer.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  }).populate(offerPopulate);

  if (!offer) return next(new ApiError(`No offer found with id: ${req.params.id}`, 404));

  sendResponse(res, { message: 'Offer updated successfully', data: offer });
});

/**
 * @desc    Delete offer
 * @route   DELETE /api/v1/offers/:id
 * @access  Private (admin)
 */
export const deleteOffer = asyncHandler(async (req, res, next) => {
  const offer = await Offer.findOneAndDelete({ _id: req.params.id });
  if (!offer) return next(new ApiError(`No offer found with id: ${req.params.id}`, 404));
  sendResponse(res, { message: 'Offer deleted successfully' });
});


/**
 * @desc    Get upcoming offers (startDate in the future)
 * @route   GET /api/v1/offers/upcoming
 * @access  Public
 */
export const getUpcomingOffers = asyncHandler(async (req, res) => {
  const now = new Date();

  const offers = await Offer.find({
    isActive: true,
    startDate: { $gt: now },
  })
    .populate(offerPopulate)
    .sort({ startDate: 1 });

  sendResponse(res, { message: 'Upcoming offers retrieved successfully', data: offers });
});
