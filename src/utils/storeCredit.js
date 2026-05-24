// src/utils/storeCredit.js
import User from '../models/User.js';
import StoreCreditTransaction from '../models/StoreCreditTransaction.js';
import ApiError from './apiError.js';

const roundMoney = (n) => Math.round(n * 100) / 100;

export const getStoreCreditBalance = async (userId, session = null) => {
  const q = User.findById(userId).select('storeCreditBalance').session(session ?? null);
  const user = await q.lean();
  return roundMoney(user?.storeCreditBalance ?? 0);
};

export const issueStoreCredit = async ({
  userId,
  amount,
  returnRequestId,
  session,
}) => {
  const rounded = roundMoney(amount);
  if (rounded <= 0) {
    throw new ApiError('Store credit amount must be greater than zero', 400);
  }

  const existing = await StoreCreditTransaction.findOne({
    returnRequest: returnRequestId,
    type: 'issued',
  })
    .session(session ?? null)
    .lean();

  if (existing) {
    return { alreadyIssued: true, balanceAfter: existing.balanceAfter };
  }

  const user = await User.findByIdAndUpdate(
    userId,
    { $inc: { storeCreditBalance: rounded } },
    { new: true, session, runValidators: true }
  );

  if (!user) {
    throw new ApiError(`No user found with id: ${userId}`, 404);
  }

  const balanceAfter = roundMoney(user.storeCreditBalance);

  await StoreCreditTransaction.create(
    [
      {
        user: userId,
        type: 'issued',
        amount: rounded,
        returnRequest: returnRequestId,
        balanceAfter,
      },
    ],
    { session }
  );

  return { alreadyIssued: false, balanceAfter };
};

export const redeemStoreCredit = async ({ userId, amount, orderId, session }) => {
  const rounded = roundMoney(amount);
  if (rounded <= 0) return { redeemed: 0, balanceAfter: await getStoreCreditBalance(userId, session) };

  const balance = await getStoreCreditBalance(userId, session);
  if (rounded > balance + 0.001) {
    throw new ApiError('Insufficient store credit balance', 400);
  }

  const user = await User.findByIdAndUpdate(
    userId,
    { $inc: { storeCreditBalance: -rounded } },
    { new: true, session, runValidators: true }
  );

  if (!user) {
    throw new ApiError(`No user found with id: ${userId}`, 404);
  }

  const balanceAfter = roundMoney(user.storeCreditBalance);

  await StoreCreditTransaction.create(
    [
      {
        user: userId,
        type: 'redeemed',
        amount: rounded,
        order: orderId,
        balanceAfter,
      },
    ],
    { session }
  );

  return { redeemed: rounded, balanceAfter };
};

export const computeStoreCreditApplied = (balance, payable) => {
  const roundedBalance = roundMoney(balance);
  const roundedPayable = roundMoney(Math.max(0, payable));
  if (roundedBalance <= 0 || roundedPayable <= 0) {
    return { storeCreditApplied: 0, payableAfterCredit: roundedPayable };
  }
  const storeCreditApplied = roundMoney(Math.min(roundedBalance, roundedPayable));
  return {
    storeCreditApplied,
    payableAfterCredit: roundMoney(roundedPayable - storeCreditApplied),
  };
};
