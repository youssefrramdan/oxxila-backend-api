// src/controllers/paymentAdmin.controller.js
import asyncHandler from 'express-async-handler';
import Order from '../models/Order.js';
import ReturnRequest from '../models/ReturnRequest.js';
import PaymentGateway, { GATEWAY_CODES } from '../models/PaymentGateway.js';
import ApiError from '../utils/apiError.js';
import sendResponse from '../utils/apiResponse.js';

const DEFAULT_PERIOD_DAYS = 30;
const PAID_MATCH = { paymentStatus: 'paid', orderStatus: { $nin: ['cancelled'] } };

const parsePositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const roundMoney = (value) => Math.round(value * 100) / 100;
const roundPercent = (value) => Math.round(value * 10) / 10;

const periodStart = (days) => {
  const end = new Date();
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (days - 1));
  start.setUTCHours(0, 0, 0, 0);
  return { start, end };
};

/**
 * @desc    Payment summary: collected, refunded, net, collection rate
 * @route   GET /api/v1/payments/summary
 * @access  Admin
 */
export const getPaymentSummary = asyncHandler(async (req, res) => {
  const periodDays = parsePositiveInt(req.query.period, DEFAULT_PERIOD_DAYS);
  const { start, end } = periodStart(periodDays);
  const dateRange = { $gte: start, $lte: end };

  const [[paidAgg], [refundAgg]] = await Promise.all([
    Order.aggregate([
      { $match: { ...PAID_MATCH, createdAt: dateRange } },
      { $group: { _id: null, collected: { $sum: '$totalPrice' }, orderCount: { $sum: 1 } } },
    ]),
    ReturnRequest.aggregate([
      {
        $match: {
          refundStatus: 'refunded',
          refundedAt: dateRange,
        },
      },
      {
        $group: {
          _id: null,
          refunded: { $sum: '$refundAmount' },
          refundCount: { $sum: 1 },
        },
      },
    ]),
  ]);

  const collected = roundMoney(paidAgg?.collected ?? 0);
  const refunded = roundMoney(refundAgg?.refunded ?? 0);
  const net = roundMoney(collected - refunded);
  const denom = collected + refunded;
  const collectionRate = denom > 0 ? roundPercent((collected / denom) * 100) : 100;

  sendResponse(res, {
    message: 'Payment summary retrieved successfully',
    data: {
      collected,
      refunded,
      net,
      collectionRate,
      orderCount: paidAgg?.orderCount ?? 0,
      refundCount: refundAgg?.refundCount ?? 0,
      periodDays,
    },
  });
});

/**
 * @desc    List payment gateways with enabled status
 * @route   GET /api/v1/payments/gateways
 * @access  Admin
 */
export const getPaymentGateways = asyncHandler(async (req, res) => {
  await PaymentGateway.ensureDefaults();
  const gateways = await PaymentGateway.find().sort({ code: 1 }).lean();

  sendResponse(res, {
    message: 'Payment gateways retrieved successfully',
    data: gateways,
  });
});

/**
 * @desc    Toggle a payment gateway
 * @route   PATCH /api/v1/payments/gateways/:code
 * @access  Admin
 */
export const updatePaymentGateway = asyncHandler(async (req, res, next) => {
  const code = String(req.params.code || '').toLowerCase();
  if (!GATEWAY_CODES.includes(code)) {
    return next(new ApiError(`Invalid gateway code: ${req.params.code}`, 400));
  }

  await PaymentGateway.ensureDefaults();

  const gateway = await PaymentGateway.findOneAndUpdate(
    { code },
    { isEnabled: Boolean(req.body.isEnabled) },
    { new: true, runValidators: true }
  );

  if (!gateway) return next(new ApiError(`No payment gateway found with code: ${code}`, 404));

  sendResponse(res, {
    message: 'Payment gateway updated successfully',
    data: gateway,
  });
});
