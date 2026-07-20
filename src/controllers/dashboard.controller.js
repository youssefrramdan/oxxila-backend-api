// src/controllers/dashboard.controller.js
import asyncHandler from 'express-async-handler';
import Cart from '../models/Cart.js';
import Order from '../models/Order.js';
import PaymentSession from '../models/PaymentSession.js';
import Product from '../models/Product.js';
import sendResponse from '../utils/apiResponse.js';

const DEFAULT_PERIOD_DAYS = 30;
const DEFAULT_LIST_LIMIT = 5;
const DEFAULT_LOW_STOCK_THRESHOLD = 10;
const CRITICAL_STOCK_THRESHOLD = 5;
const COUNTED_ORDER_STATUSES = { $nin: ['cancelled'] };
const PAID_ORDER_MATCH = { paymentStatus: 'paid', orderStatus: COUNTED_ORDER_STATUSES };

const roundMoney = (value) => Math.round(value * 100) / 100;
const roundPercent = (value) => Math.round(value * 10) / 10;

const parsePositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const startOfUtcDay = (date) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));

const shiftDays = (date, days) => {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
};

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

const resolveProductPrice = (product) => product.priceAfterDiscount ?? product.price;

const mapOrderBadge = (order) => {
  if (order.paymentStatus === 'paid') return 'PAID';
  if (order.paymentStatus === 'refunded') return 'REFUNDED';
  if (order.orderStatus === 'processing') return 'PROCESSING';
  if (order.orderStatus === 'confirmed') return 'CONFIRMED';
  if (order.orderStatus === 'shipped' || order.orderStatus === 'out_for_delivery') return 'SHIPPED';
  if (order.orderStatus === 'delivered') return 'DELIVERED';
  if (order.orderStatus === 'cancelled') return 'CANCELLED';
  return 'PENDING';
};

const aggregateRevenue = async (start, end) => {
  const [result] = await Order.aggregate([
    {
      $match: {
        ...PAID_ORDER_MATCH,
        createdAt: { $gte: start, $lte: end },
      },
    },
    {
      $group: {
        _id: null,
        revenue: { $sum: '$totalPrice' },
        orders: { $sum: 1 },
      },
    },
  ]);

  return {
    revenue: roundMoney(result?.revenue ?? 0),
    orders: result?.orders ?? 0,
  };
};

const countCheckoutAttempts = async (start, end) => {
  const [orders, sessions, carts] = await Promise.all([
    Order.countDocuments({
      orderStatus: COUNTED_ORDER_STATUSES,
      createdAt: { $gte: start, $lte: end },
    }),
    PaymentSession.countDocuments({
      createdAt: { $gte: start, $lte: end },
    }),
    Cart.countDocuments({
      'items.0': { $exists: true },
      updatedAt: { $gte: start, $lte: end },
    }),
  ]);

  return orders + sessions + carts;
};

const countActiveCarts = () =>
  Cart.countDocuments({
    'items.0': { $exists: true },
  });

const buildConversionRate = (orders, attempts) => {
  if (attempts === 0) return 0;
  return roundPercent((orders / attempts) * 100);
};

const buildAbandonedCartRate = (orders, attempts) => {
  if (attempts === 0) return 0;
  return roundPercent(((attempts - orders) / attempts) * 100);
};

const buildKpis = async (days) => {
  const { currentStart, end, previousStart, previousEnd } = periodBounds(days);

  const [
    currentRevenue,
    previousRevenue,
    currentAttempts,
    previousAttempts,
    currentActiveCarts,
    previousActiveCarts,
  ] = await Promise.all([
    aggregateRevenue(currentStart, end),
    aggregateRevenue(previousStart, previousEnd),
    countCheckoutAttempts(currentStart, end),
    countCheckoutAttempts(previousStart, previousEnd),
    countActiveCarts(),
    Cart.countDocuments({
      'items.0': { $exists: true },
      updatedAt: { $lte: previousEnd },
    }),
  ]);

  const currentConversion = buildConversionRate(currentRevenue.orders, currentAttempts);
  const previousConversion = buildConversionRate(previousRevenue.orders, previousAttempts);
  const currentAbandoned = buildAbandonedCartRate(currentRevenue.orders, currentAttempts);
  const previousAbandoned = buildAbandonedCartRate(previousRevenue.orders, previousAttempts);

  return {
    totalRevenue: {
      value: currentRevenue.revenue,
      trend: calcTrend(currentRevenue.revenue, previousRevenue.revenue),
    },
    orders: {
      value: currentRevenue.orders,
      trend: calcTrend(currentRevenue.orders, previousRevenue.orders),
    },
    conversionRate: {
      value: currentConversion,
      trend: calcTrend(currentConversion, previousConversion),
    },
    abandonedCart: {
      value: currentAbandoned,
      trend: calcTrend(currentAbandoned, previousAbandoned),
      activeCarts: currentActiveCarts,
      previousActiveCarts,
    },
    periodDays: days,
  };
};

const formatWeekKey = (year, week) => `${year}-W${String(week).padStart(2, '0')}`;

const fillDailySeries = (rows, start, end) => {
  const bucketMap = new Map(rows.map((row) => [row._id, row]));
  const series = [];
  const cursor = startOfUtcDay(start);
  const last = startOfUtcDay(end);

  while (cursor <= last) {
    const key = cursor.toISOString().slice(0, 10);
    const found = bucketMap.get(key);
    series.push({
      date: key,
      revenue: roundMoney(found?.revenue ?? 0),
      orders: found?.orders ?? 0,
    });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return series;
};

const buildRevenueChart = async (days, interval) => {
  const { currentStart, end } = periodBounds(days);
  const matchStage = {
    $match: {
      ...PAID_ORDER_MATCH,
      createdAt: { $gte: currentStart, $lte: end },
    },
  };

  if (interval === 'weekly') {
    const rows = await Order.aggregate([
      matchStage,
      {
        $group: {
          _id: {
            year: { $isoWeekYear: '$createdAt' },
            week: { $isoWeek: '$createdAt' },
          },
          revenue: { $sum: '$totalPrice' },
          orders: { $sum: 1 },
        },
      },
      { $sort: { '_id.year': 1, '_id.week': 1 } },
    ]);

    return {
      interval,
      periodDays: days,
      points: rows.map((row) => ({
        date: formatWeekKey(row._id.year, row._id.week),
        revenue: roundMoney(row.revenue),
        orders: row.orders,
      })),
    };
  }

  const rows = await Order.aggregate([
    matchStage,
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
        revenue: { $sum: '$totalPrice' },
        orders: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  return {
    interval,
    periodDays: days,
    points: fillDailySeries(rows, currentStart, end),
  };
};

const buildCustomerSegments = async () => {
  const [result] = await Order.aggregate([
    { $match: PAID_ORDER_MATCH },
    { $group: { _id: '$user', orderCount: { $sum: 1 } } },
    {
      $group: {
        _id: null,
        loyalPatients: { $sum: { $cond: [{ $gt: ['$orderCount', 1] }, 1, 0] } },
        newClients: { $sum: { $cond: [{ $eq: ['$orderCount', 1] }, 1, 0] } },
      },
    },
  ]);

  const loyalPatients = result?.loyalPatients ?? 0;
  const newClients = result?.newClients ?? 0;
  const total = loyalPatients + newClients;
  const returningPercent = total > 0 ? roundPercent((loyalPatients / total) * 100) : 0;

  return {
    returningPercent,
    loyalPatients,
    newClients,
    totalCustomersWithOrders: total,
  };
};

const buildTopProducts = async (limit) => {
  const products = await Product.find({ isActive: true })
    .sort({ soldCount: -1, views: -1 })
    .limit(limit)
    .select('name images soldCount price priceAfterDiscount')
    .lean();

  return products.map((product) => ({
    id: product._id,
    name: product.name,
    image: product.images?.[0] ?? null,
    unitsSold: product.soldCount ?? 0,
    price: resolveProductPrice(product),
  }));
};

const buildLowStockAlerts = async (limit, threshold) => {
  const products = await Product.find({ isActive: true, stock: { $lte: threshold } })
    .sort({ stock: 1 })
    .limit(limit)
    .select('name stock')
    .lean();

  return products.map((product) => ({
    id: product._id,
    name: product.name,
    stock: product.stock,
    stockLevel: roundPercent(Math.min((product.stock / threshold) * 100, 100)),
    isCritical: product.stock <= CRITICAL_STOCK_THRESHOLD,
  }));
};

const buildRecentOrders = async (limit) => {
  const orders = await Order.find()
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate('user', 'name')
    .select('user totalPrice paymentStatus orderStatus createdAt')
    .lean();

  return orders.map((order) => ({
    id: order._id,
    customerName: order.user?.name ?? 'Unknown customer',
    totalAmount: roundMoney(order.totalPrice),
    status: mapOrderBadge(order),
    createdAt: order.createdAt,
  }));
};

const extractFirstName = (name) => String(name || '').trim().split(/\s+/)[0] || 'Admin';

/**
 * @desc    Dashboard overview for admin home
 * @route   GET /api/v1/dashboard
 * @access  Admin
 */
export const getDashboard = asyncHandler(async (req, res) => {
  const periodDays = parsePositiveInt(req.query.period, DEFAULT_PERIOD_DAYS);
  const listLimit = parsePositiveInt(req.query.limit, DEFAULT_LIST_LIMIT);
  const lowStockThreshold = parsePositiveInt(req.query.lowStockThreshold, DEFAULT_LOW_STOCK_THRESHOLD);

  // revenueChart is loaded separately via GET /dashboard/revenue (daily/weekly toggle)
  const [kpis, customerSegments, topProducts, lowStock, recentOrders] = await Promise.all([
    buildKpis(periodDays),
    buildCustomerSegments(),
    buildTopProducts(listLimit),
    buildLowStockAlerts(listLimit, lowStockThreshold),
    buildRecentOrders(listLimit),
  ]);

  sendResponse(res, {
    message: 'Dashboard data retrieved successfully',
    data: {
      greeting: {
        firstName: extractFirstName(req.user.name),
      },
      kpis,
      customerSegments,
      topProducts,
      lowStock,
      recentOrders,
    },
  });
});

/**
 * @desc    Revenue chart series for dashboard analytics
 * @route   GET /api/v1/dashboard/revenue
 * @access  Admin
 */
export const getDashboardRevenue = asyncHandler(async (req, res) => {
  const periodDays = parsePositiveInt(req.query.period, DEFAULT_PERIOD_DAYS);
  const revenueInterval = req.query.interval === 'weekly' ? 'weekly' : 'daily';
  const revenueChart = await buildRevenueChart(periodDays, revenueInterval);

  sendResponse(res, {
    message: 'Dashboard revenue chart retrieved successfully',
    data: revenueChart,
  });
});
