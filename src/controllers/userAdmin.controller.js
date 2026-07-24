// src/controllers/userAdmin.controller.js
// Admin user management (CRUD, activate, password)
import asyncHandler from 'express-async-handler';
import mongoose from 'mongoose';
import Order from '../models/Order.js';
import User from '../models/User.js';
import ApiError from '../utils/apiError.js';
import ApiFeatures from '../utils/apiFeatures.js';
import sendResponse from '../utils/apiResponse.js';

const COUNTED_ORDER_STATUSES = { $nin: ['cancelled'] };
const PAID_ORDER_MATCH = { paymentStatus: 'paid', orderStatus: COUNTED_ORDER_STATUSES };
const CUSTOMER_ROLE_MATCH = { role: 'user' };
const roundMoney = (value) => Math.round(value * 100) / 100;
const roundPercent = (value) => Math.round(value * 10) / 10;

const shiftDays = (date, days) => {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
};

const startOfUtcMonth = (date = new Date()) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));

const startOfUtcYear = (date = new Date()) =>
  new Date(Date.UTC(date.getUTCFullYear(), 0, 1));

const calcTrend = (current, previous) => {
  if (previous === 0) return current > 0 ? 100 : 0;
  return roundPercent(((current - previous) / previous) * 100);
};

/** Batch: orders count, total paid, last order date — for customers table columns */
const buildCustomerOrderStats = async (userIds) => {
  const map = new Map(
    userIds.map((id) => [
      String(id),
      { orders: 0, totalPaid: 0, lastOrder: null },
    ])
  );
  if (!userIds.length) return map;

  const objectIds = userIds.map((id) =>
    id instanceof mongoose.Types.ObjectId ? id : new mongoose.Types.ObjectId(String(id))
  );

  const rows = await Order.aggregate([
    {
      $match: {
        user: { $in: objectIds },
        orderStatus: COUNTED_ORDER_STATUSES,
      },
    },
    {
      $group: {
        _id: '$user',
        orders: { $sum: 1 },
        totalPaid: {
          $sum: {
            $cond: [{ $eq: ['$paymentStatus', 'paid'] }, '$totalPrice', 0],
          },
        },
        lastOrder: { $max: '$createdAt' },
      },
    },
  ]);

  for (const row of rows) {
    map.set(String(row._id), {
      orders: row.orders,
      totalPaid: roundMoney(row.totalPaid),
      lastOrder: row.lastOrder,
    });
  }
  return map;
};

/**
 * @desc    Customer Intelligence KPIs (Total Customers + Average LTV only)
 * @route   GET /api/v1/users/stats
 * @access  Admin
 */
export const getCustomerStats = asyncHandler(async (req, res) => {
  const now = new Date();
  const monthStart = startOfUtcMonth(now);
  const previousMonthStart = startOfUtcMonth(shiftDays(monthStart, -1));
  const yearStart = startOfUtcYear(now);
  const previousYearStart = startOfUtcYear(new Date(Date.UTC(now.getUTCFullYear() - 1, 0, 1)));
  const previousYearEnd = shiftDays(yearStart, -1);

  const [
    totalCustomers,
    newThisMonth,
    previousMonthNew,
    [currentLtvAgg],
    [previousYearLtvAgg],
  ] = await Promise.all([
    User.countDocuments(CUSTOMER_ROLE_MATCH),
    User.countDocuments({ ...CUSTOMER_ROLE_MATCH, createdAt: { $gte: monthStart, $lte: now } }),
    User.countDocuments({
      ...CUSTOMER_ROLE_MATCH,
      createdAt: { $gte: previousMonthStart, $lt: monthStart },
    }),
    Order.aggregate([
      { $match: { ...PAID_ORDER_MATCH, createdAt: { $gte: yearStart, $lte: now } } },
      {
        $group: {
          _id: '$user',
          spend: { $sum: '$totalPrice' },
        },
      },
      {
        $group: {
          _id: null,
          totalSpend: { $sum: '$spend' },
          payingCustomers: { $sum: 1 },
        },
      },
    ]),
    Order.aggregate([
      {
        $match: {
          ...PAID_ORDER_MATCH,
          createdAt: { $gte: previousYearStart, $lte: previousYearEnd },
        },
      },
      {
        $group: {
          _id: '$user',
          spend: { $sum: '$totalPrice' },
        },
      },
      {
        $group: {
          _id: null,
          totalSpend: { $sum: '$spend' },
          payingCustomers: { $sum: 1 },
        },
      },
    ]),
  ]);

  const currentPaying = currentLtvAgg?.payingCustomers ?? 0;
  const previousPaying = previousYearLtvAgg?.payingCustomers ?? 0;
  const averageLtv =
    currentPaying > 0 ? roundMoney((currentLtvAgg.totalSpend ?? 0) / currentPaying) : 0;
  const previousAverageLtv =
    previousPaying > 0
      ? roundMoney((previousYearLtvAgg.totalSpend ?? 0) / previousPaying)
      : 0;
  const ltvTrend = calcTrend(averageLtv, previousAverageLtv);

  sendResponse(res, {
    message: 'Customer stats retrieved successfully',
    data: {
      totalCustomers: {
        value: totalCustomers,
        newThisMonth,
        trendLabel: `+${newThisMonth} this month`,
        trend: calcTrend(newThisMonth, previousMonthNew),
      },
      averageLtv: {
        value: averageLtv,
        trend: ltvTrend,
        trendLabel: `${ltvTrend >= 0 ? '+' : ''}${ltvTrend}% vs last year`,
      },
    },
  });
});

/**
 * @desc    List all users (customers table: name/email/avatar + orders/totalPaid/lastOrder)
 * @route   GET /api/v1/users
 * @access  Admin
 */
export const getAllUsers = asyncHandler(async (req, res) => {
  const features = new ApiFeatures(User.find(), req.query)
    .filter()
    .search(['name', 'email'])
    .sort()
    .limitFields();

  await features.paginate();

  const users = await features.mongooseQuery.lean();
  const statsByUser = await buildCustomerOrderStats(users.map((u) => u._id));
  const pagination = features.getPaginationResult();

  const data = users.map((user) => {
    const stats = statsByUser.get(String(user._id)) ?? {
      orders: 0,
      totalPaid: 0,
      lastOrder: null,
    };
    return {
      ...user,
      orders: stats.orders,
      totalPaid: stats.totalPaid,
      totalSpend: stats.totalPaid,
      lastOrder: stats.lastOrder,
    };
  });

  sendResponse(res, {
    message: 'Users retrieved successfully',
    data,
    pagination: { ...pagination, results: data.length },
  });
});

/**
 * @desc    Get one user (customer detail: + orders / totalSpend / lastOrder)
 * @route   GET /api/v1/users/:id
 * @access  Admin
 */
export const getSpecificUser = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.params.id).lean();
  if (!user) return next(new ApiError(`No user found with id: ${req.params.id}`, 404));

  const statsByUser = await buildCustomerOrderStats([user._id]);
  const stats = statsByUser.get(String(user._id)) ?? {
    orders: 0,
    totalPaid: 0,
    lastOrder: null,
  };

  sendResponse(res, {
    message: 'User retrieved successfully',
    data: {
      ...user,
      orders: stats.orders,
      totalPaid: stats.totalPaid,
      totalSpend: stats.totalPaid,
      lastOrder: stats.lastOrder,
    },
  });
});

/**
 * @desc    Create user
 * @route   POST /api/v1/users
 * @access  Admin
 */
export const createUser = asyncHandler(async (req, res) => {
  const user = await User.create(req.body);
  sendResponse(res, { statusCode: 201, message: 'User created successfully', data: user });
});

/**
 * @desc    Update user (excludes password/role from body)
 * @route   PUT /api/v1/users/:id
 * @access  Admin
 */
export const updateUser = asyncHandler(async (req, res, next) => {
  const { password, role, ...rest } = req.body;
  const user = await User.findByIdAndUpdate(req.params.id, rest, {
    new: true,
    runValidators: true,
  });
  if (!user) return next(new ApiError(`No user found with id: ${req.params.id}`, 404));
  sendResponse(res, { message: 'User updated successfully', data: user });
});

/**
 * @desc    Delete user
 * @route   DELETE /api/v1/users/:id
 * @access  Admin
 */
export const deleteUser = asyncHandler(async (req, res, next) => {
  const user = await User.findByIdAndDelete(req.params.id);
  if (!user) return next(new ApiError(`No user found with id: ${req.params.id}`, 404));
  sendResponse(res, { message: 'User deleted successfully' });
});

/**
 * @desc    Activate user
 * @route   PATCH /api/v1/users/activate/:id
 * @access  Admin
 */
export const activateSpecificUser = asyncHandler(async (req, res, next) => {
  const user = await User.findByIdAndUpdate(req.params.id, { active: true }, { new: true });
  if (!user) return next(new ApiError(`No user found with id: ${req.params.id}`, 404));
  sendResponse(res, { message: 'User activated successfully', data: user });
});

/**
 * @desc    Change user password
 * @route   PATCH /api/v1/users/changePassword/:id
 * @access  Admin
 */
export const changeUserPassword = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.params.id).select('+password');
  if (!user) return next(new ApiError(`No user found with id: ${req.params.id}`, 404));

  user.password = req.body.password;
  await user.save();

  sendResponse(res, { message: "User's password updated successfully", data: user });
});
