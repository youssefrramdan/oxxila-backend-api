// src/controllers/giftCard.controller.js
import asyncHandler from 'express-async-handler';
import User from '../models/User.js';
import StoreCreditTransaction from '../models/StoreCreditTransaction.js';
import ApiError from '../utils/apiError.js';
import sendResponse from '../utils/apiResponse.js';

const roundMoney = (n) => Math.round(Number(n) * 100) / 100;

/**
 * Map a store-credit ledger row to the Gift Cards UI shape.
 * COD return refunds are issued as store credit and shown as gift balance.
 */
const toGiftCardTx = (tx) => ({
  id: tx._id,
  type: tx.type, // issued | redeemed
  amount: tx.amount,
  balanceAfter: tx.balanceAfter,
  source:
    tx.type === 'issued' && tx.returnRequest
      ? 'cod_return'
      : tx.type === 'redeemed' && tx.order
        ? 'order'
        : 'other',
  returnRequestId: tx.returnRequest?._id ?? tx.returnRequest ?? null,
  orderId: tx.order?._id ?? tx.order ?? null,
  orderNumber: tx.order?.orderNumber ?? null,
  createdAt: tx.createdAt,
});

/**
 * @desc    Current user's gift card (store credit) balance + ledger
 * @route   GET /api/v1/gift-cards
 * @access  Private
 *
 * Gift Cards in the account menu = User.storeCreditBalance.
 * COD return refunds credit this balance (type=issued, linked to returnRequest).
 */
export const getMyGiftCards = asyncHandler(async (req, res, next) => {
  const userId = req.user._id;

  const user = await User.findById(userId).select('storeCreditBalance').lean();
  if (!user) return next(new ApiError(`No user found with id: ${userId}`, 404));

  const txs = await StoreCreditTransaction.find({ user: userId })
    .sort({ createdAt: -1 })
    .limit(100)
    .populate({ path: 'order', select: 'orderNumber' })
    .lean();

  sendResponse(res, {
    message: 'Gift cards retrieved successfully',
    data: {
      balance: roundMoney(user.storeCreditBalance ?? 0),
      currency: 'EGP',
      transactions: txs.map(toGiftCardTx),
    },
  });
});
