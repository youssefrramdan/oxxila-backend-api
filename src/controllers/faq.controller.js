// src/controllers/faq.controller.js
import asyncHandler from 'express-async-handler';
import FAQ from '../models/FAQ.js';
import Product from '../models/Product.js';
import ApiError from '../utils/apiError.js';
import sendResponse from '../utils/apiResponse.js';
import sendEmail from '../utils/email.js';
import askSpecialistTemplate from '../utils/emailTemplates/askSpecialistTemplate.js';

// @desc    Get all active FAQs for a product
// @route   GET /api/v1/products/:productId/faqs
// @access  Public
export const getProductFaqs = asyncHandler(async (req, res, next) => {
  const { productId } = req.params;

  const product = await Product.findById(productId).select('_id');
  if (!product) return next(new ApiError(`No product found with id: ${productId}`, 404));

  const faqs = await FAQ.find({ product: productId, isActive: true }).sort({ createdAt: -1 }).lean();

  sendResponse(res, {
    message: 'FAQs retrieved successfully',
    data: faqs,
  });
});

// @desc    Create FAQ for a product
// @route   POST /api/v1/products/:productId/faqs
// @access  Admin
export const createFaq = asyncHandler(async (req, res, next) => {
  const { productId } = req.params;

  const product = await Product.findById(productId).select('_id');
  if (!product) return next(new ApiError(`No product found with id: ${productId}`, 404));

  const faq = await FAQ.create({
    question: req.body.question,
    answer: req.body.answer,
    product: productId,
    ...(typeof req.body.isActive === 'boolean' ? { isActive: req.body.isActive } : {}),
  });

  sendResponse(res, {
    statusCode: 201,
    message: 'FAQ created successfully',
    data: faq,
  });
});

// @desc    Update FAQ
// @route   PUT /api/v1/faqs/:id
// @access  Admin
export const updateFaq = asyncHandler(async (req, res, next) => {
  const payload = {};
  if (req.body.question !== undefined) payload.question = req.body.question;
  if (req.body.answer !== undefined) payload.answer = req.body.answer;
  if (req.body.isActive !== undefined) payload.isActive = req.body.isActive;

  if (Object.keys(payload).length === 0) {
    return next(new ApiError('Provide at least one of: question, answer, isActive', 400));
  }

  const faq = await FAQ.findByIdAndUpdate(req.params.id, payload, {
    new: true,
    runValidators: true,
  });
  if (!faq) return next(new ApiError(`No FAQ found with id: ${req.params.id}`, 404));

  sendResponse(res, { message: 'FAQ updated successfully', data: faq });
});

// @desc    Delete FAQ
// @route   DELETE /api/v1/faqs/:id
// @access  Admin
export const deleteFaq = asyncHandler(async (req, res, next) => {
  const faq = await FAQ.findByIdAndDelete(req.params.id);
  if (!faq) return next(new ApiError(`No FAQ found with id: ${req.params.id}`, 404));

  sendResponse(res, { message: 'FAQ deleted successfully' });
});

// @desc    User asks about a product — email sent to admin
// @route   POST /api/v1/products/:productId/faqs/ask
// @access  Private (user, admin)
export const askSpecialist = asyncHandler(async (req, res, next) => {
  const { productId } = req.params;
  const { question } = req.body;

  const adminEmail = process.env.SEED_ADMIN_EMAIL;
  if (!adminEmail) {
    return next(new ApiError('Specialist inquiries are not configured on the server', 503));
  }

  const product = await Product.findById(productId)
    .select('name slug images price priceAfterDiscount stock description isActive brand category')
    .populate('brand', 'name')
    .populate('category', 'name');

  if (!product) return next(new ApiError(`No product found with id: ${productId}`, 404));
  if (!product.isActive) return next(new ApiError('Product is not available', 400));

  const images = product.images ?? [];
  const imageUrl = typeof images[0] === 'string' && /^https?:\/\//i.test(images[0]) ? images[0] : null;

  const descriptionPlain = String(product.description ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const descriptionExcerpt =
    descriptionPlain.length > 220 ? `${descriptionPlain.slice(0, 220)}…` : descriptionPlain;

  const { subject, html } = askSpecialistTemplate({
    productName: product.name,
    productSlug: product.slug,
    imageUrl,
    price: product.price,
    priceAfterDiscount: product.priceAfterDiscount,
    stock: product.stock,
    descriptionExcerpt: descriptionExcerpt || null,
    brandName: product.brand?.name ?? null,
    categoryName: product.category?.name ?? null,
    userQuestion: question,
  });

  try {
    await sendEmail({
      email: adminEmail,
      subject,
      html,
    });
  } catch {
    return next(new ApiError('Could not deliver your message. Please try again later.', 500));
  }

  sendResponse(res, {
    message: 'Your question has been sent. Our specialist will get back to you soon!',
  });
});
