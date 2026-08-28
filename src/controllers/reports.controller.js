// src/controllers/reports.controller.js
import asyncHandler from 'express-async-handler';
import mongoose from 'mongoose';
import Order from '../models/Order.js';
import Product from '../models/Product.js';
import ApiError from '../utils/apiError.js';
import sendResponse from '../utils/apiResponse.js';
import { csvFilename, sendCsvResponse } from '../utils/csvExport.js';
import { formatReportPeriodIso, resolveReportDateRange } from '../utils/reportDateRange.js';

const COUNTED_ORDER_STATUSES = { $nin: ['cancelled'] };
const SALES_ORDER_MATCH = { paymentStatus: 'paid', orderStatus: COUNTED_ORDER_STATUSES };

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const DEFAULT_SORT = '-grossRevenue';
const RECENT_ORDERS_LIMIT = 20;

const roundMoney = (value) => Math.round(value * 100) / 100;

const parsePositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const resolveSortStage = (sortKey) => {
  switch (sortKey) {
    case 'grossRevenue':
      return { grossRevenue: 1 };
    case '-unitsSold':
      return { unitsSold: -1 };
    case 'unitsSold':
      return { unitsSold: 1 };
    case 'name':
      return { name: 1 };
    case '-name':
      return { name: -1 };
    case '-grossRevenue':
    default:
      return { grossRevenue: -1 };
  }
};

const buildSalesMatchStage = (start, end) => ({
  $match: {
    ...SALES_ORDER_MATCH,
    createdAt: { $gte: start, $lte: end },
  },
});

const buildGroupedRowsPipeline = (start, end, filters = {}) => {
  const pipeline = [
    buildSalesMatchStage(start, end),
    { $unwind: '$items' },
  ];

  if (filters.productId) {
    pipeline.push({
      $match: { 'items.product': new mongoose.Types.ObjectId(filters.productId) },
    });
  }

  pipeline.push(
    {
      $group: {
        _id: '$items.product',
        name: { $first: '$items.name' },
        unitsSold: { $sum: '$items.quantity' },
        grossRevenue: {
          $sum: { $multiply: ['$items.price', '$items.quantity'] },
        },
        orderIds: { $addToSet: '$_id' },
      },
    },
    {
      $lookup: {
        from: 'products',
        localField: '_id',
        foreignField: '_id',
        as: 'product',
      },
    },
    { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: 'categories',
        localField: 'product.category',
        foreignField: '_id',
        as: 'categoryDoc',
      },
    },
    {
      $lookup: {
        from: 'brands',
        localField: 'product.brand',
        foreignField: '_id',
        as: 'brandDoc',
      },
    },
    {
      $addFields: {
        name: { $ifNull: ['$product.name', '$name'] },
        image: { $arrayElemAt: ['$product.images', 0] },
        categoryId: '$product.category',
        categoryName: { $arrayElemAt: ['$categoryDoc.name', 0] },
        brandId: '$product.brand',
        brandName: { $arrayElemAt: ['$brandDoc.name', 0] },
        orderCount: { $size: '$orderIds' },
        avgUnitPrice: {
          $cond: [
            { $gt: ['$unitsSold', 0] },
            { $divide: ['$grossRevenue', '$unitsSold'] },
            0,
          ],
        },
      },
    },
    {
      $project: {
        productId: '$_id',
        name: 1,
        image: 1,
        category: {
          id: '$categoryId',
          name: '$categoryName',
        },
        brand: {
          id: '$brandId',
          name: '$brandName',
        },
        unitsSold: 1,
        grossRevenue: 1,
        orderCount: 1,
        avgUnitPrice: 1,
      },
    },
  );

  const postFilters = [];

  if (filters.search) {
    postFilters.push({
      $match: {
        name: { $regex: filters.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' },
      },
    });
  }

  if (filters.category) {
    postFilters.push({
      $match: { 'category.id': new mongoose.Types.ObjectId(filters.category) },
    });
  }

  if (filters.brand) {
    postFilters.push({
      $match: { 'brand.id': new mongoose.Types.ObjectId(filters.brand) },
    });
  }

  return [...pipeline, ...postFilters];
};

const mapGroupedRow = (row) => ({
  productId: row.productId,
  name: row.name ?? 'Unknown product',
  image: row.image ?? null,
  category: row.category?.id
    ? { id: row.category.id, name: row.category.name ?? null }
    : null,
  brand: row.brand?.id ? { id: row.brand.id, name: row.brand.name ?? null } : null,
  unitsSold: row.unitsSold ?? 0,
  grossRevenue: roundMoney(row.grossRevenue ?? 0),
  orderCount: row.orderCount ?? 0,
  avgUnitPrice: roundMoney(row.avgUnitPrice ?? 0),
});

const countDistinctPaidOrders = async (start, end) => {
  const result = await Order.countDocuments({
    ...SALES_ORDER_MATCH,
    createdAt: { $gte: start, $lte: end },
  });
  return result;
};

const fillDailySeries = (rows, start, end) => {
  const byDate = new Map(rows.map((row) => [row._id, row]));
  const series = [];
  const cursor = new Date(start);

  while (cursor <= end) {
    const key = cursor.toISOString().slice(0, 10);
    const row = byDate.get(key);
    series.push({
      date: key,
      revenue: roundMoney(row?.revenue ?? 0),
      units: row?.units ?? 0,
      orders: row?.orders ?? 0,
    });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return series;
};

const formatWeekKey = (year, week) => `${year}-W${String(week).padStart(2, '0')}`;

const buildProductTimeseries = async (productId, start, end, interval) => {
  const matchStage = {
    $match: {
      ...SALES_ORDER_MATCH,
      createdAt: { $gte: start, $lte: end },
    },
  };

  const unwindStages = [
    { $unwind: '$items' },
    { $match: { 'items.product': new mongoose.Types.ObjectId(productId) } },
  ];

  if (interval === 'weekly') {
    const rows = await Order.aggregate([
      matchStage,
      ...unwindStages,
      {
        $group: {
          _id: {
            year: { $isoWeekYear: '$createdAt' },
            week: { $isoWeek: '$createdAt' },
          },
          revenue: { $sum: { $multiply: ['$items.price', '$items.quantity'] } },
          units: { $sum: '$items.quantity' },
          orders: { $addToSet: '$_id' },
        },
      },
      { $sort: { '_id.year': 1, '_id.week': 1 } },
    ]);

    return rows.map((row) => ({
      date: formatWeekKey(row._id.year, row._id.week),
      revenue: roundMoney(row.revenue),
      units: row.units,
      orders: row.orders.length,
    }));
  }

  const rows = await Order.aggregate([
    matchStage,
    ...unwindStages,
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
        revenue: { $sum: { $multiply: ['$items.price', '$items.quantity'] } },
        units: { $sum: '$items.quantity' },
        orders: { $addToSet: '$_id' },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  return fillDailySeries(
    rows.map((row) => ({
      _id: row._id,
      revenue: row.revenue,
      units: row.units,
      orders: row.orders.length,
    })),
    start,
    end,
  );
};

const buildRecentProductOrders = async (productId, start, end, limit) => {
  const orders = await Order.aggregate([
    buildSalesMatchStage(start, end),
    { $unwind: '$items' },
    { $match: { 'items.product': new mongoose.Types.ObjectId(productId) } },
    {
      $group: {
        _id: '$_id',
        createdAt: { $first: '$createdAt' },
        quantity: { $sum: '$items.quantity' },
        lineRevenue: { $sum: { $multiply: ['$items.price', '$items.quantity'] } },
      },
    },
    { $sort: { createdAt: -1 } },
    { $limit: limit },
  ]);

  return orders.map((order) => ({
    orderId: order._id,
    createdAt: order.createdAt,
    quantity: order.quantity,
    lineRevenue: roundMoney(order.lineRevenue),
  }));
};

const resolveProductHeader = async (productId) => {
  const product = await Product.findById(productId)
    .populate('category', 'name')
    .populate('brand', 'name')
    .select('name images price priceAfterDiscount category brand')
    .lean();

  if (!product) return null;

  return {
    productId: product._id,
    name: product.name,
    image: product.images?.[0] ?? null,
    price: roundMoney(product.priceAfterDiscount ?? product.price),
    category: product.category
      ? { id: product.category._id, name: product.category.name }
      : null,
    brand: product.brand ? { id: product.brand._id, name: product.brand.name } : null,
  };
};

const listFiltersFromQuery = (query) => ({
  search: typeof query.search === 'string' ? query.search.trim() : '',
  category: query.category,
  brand: query.brand,
});

/**
 * @desc    Product sales report (all products)
 * @route   GET /api/v1/reports/product-sales
 * @access  Admin (reports:read)
 */
export const getProductSalesReport = asyncHandler(async (req, res) => {
  const { start, end, periodDays } = resolveReportDateRange(req.query);
  const page = parsePositiveInt(req.query.page, DEFAULT_PAGE);
  const limit = parsePositiveInt(req.query.limit, DEFAULT_LIMIT);
  const sortKey = req.query.sort || DEFAULT_SORT;
  const filters = listFiltersFromQuery(req.query);

  const basePipeline = buildGroupedRowsPipeline(start, end, filters);
  const sortStage = { $sort: resolveSortStage(sortKey) };
  const skip = (page - 1) * limit;

  const [facetResult, orderCount] = await Promise.all([
    Order.aggregate([
      ...basePipeline,
      {
        $facet: {
          rows: [sortStage, { $skip: skip }, { $limit: limit }],
          total: [{ $count: 'count' }],
          totals: [
            {
              $group: {
                _id: null,
                totalRevenue: { $sum: '$grossRevenue' },
                totalUnits: { $sum: '$unitsSold' },
                productCount: { $sum: 1 },
              },
            },
          ],
        },
      },
    ]),
    countDistinctPaidOrders(start, end),
  ]);

  const facet = facetResult[0] ?? {};
  const rows = (facet.rows ?? []).map(mapGroupedRow);
  const totalResults = facet.total?.[0]?.count ?? 0;
  const totals = facet.totals?.[0] ?? {};

  sendResponse(res, {
    message: 'Product sales report retrieved successfully',
    data: {
      summary: {
        totalRevenue: roundMoney(totals.totalRevenue ?? 0),
        totalUnits: totals.totalUnits ?? 0,
        orderCount,
        productCount: totals.productCount ?? 0,
      },
      period: { ...formatReportPeriodIso(start, end), days: periodDays },
      rows,
    },
    pagination: {
      currentPage: page,
      limit,
      numberOfPages: Math.max(Math.ceil(totalResults / limit), 1),
      totalDocuments: totalResults,
      nextPage: skip + limit < totalResults ? page + 1 : null,
      prevPage: page > 1 ? page - 1 : null,
      results: rows.length,
    },
  });
});

/**
 * @desc    Single product sales report
 * @route   GET /api/v1/reports/product-sales/:productId
 * @access  Admin (reports:read)
 */
export const getSingleProductSalesReport = asyncHandler(async (req, res, next) => {
  const { productId } = req.params;
  const { start, end, periodDays } = resolveReportDateRange(req.query);
  const interval = req.query.interval === 'weekly' ? 'weekly' : 'daily';

  const [product, grouped, timeseries, recentOrders] = await Promise.all([
    resolveProductHeader(productId),
    Order.aggregate([
      ...buildGroupedRowsPipeline(start, end, { productId }),
      { $limit: 1 },
    ]),
    buildProductTimeseries(productId, start, end, interval),
    buildRecentProductOrders(productId, start, end, RECENT_ORDERS_LIMIT),
  ]);

  if (!product) {
    return next(new ApiError(`No product found with id: ${productId}`, 404));
  }

  const row = grouped[0] ? mapGroupedRow(grouped[0]) : {
    productId,
    name: product.name,
    image: product.image,
    category: product.category,
    brand: product.brand,
    unitsSold: 0,
    grossRevenue: 0,
    orderCount: 0,
    avgUnitPrice: 0,
  };

  sendResponse(res, {
    message: 'Product sales detail retrieved successfully',
    data: {
      product,
      summary: {
        totalRevenue: row.grossRevenue,
        totalUnits: row.unitsSold,
        orderCount: row.orderCount,
        avgUnitPrice: row.avgUnitPrice,
      },
      period: { ...formatReportPeriodIso(start, end), days: periodDays },
      timeseries,
      recentOrders,
      interval,
    },
  });
});

/**
 * @desc    Export all product sales as CSV
 * @route   GET /api/v1/reports/product-sales/export
 * @access  Admin (reports:read)
 */
export const exportProductSalesCsv = asyncHandler(async (req, res) => {
  const { start, end } = resolveReportDateRange(req.query);
  const sortKey = req.query.sort || DEFAULT_SORT;
  const filters = listFiltersFromQuery(req.query);

  const rows = await Order.aggregate([
    ...buildGroupedRowsPipeline(start, end, filters),
    { $sort: resolveSortStage(sortKey) },
  ]);

  const mapped = rows.map(mapGroupedRow);
  const period = formatReportPeriodIso(start, end);

  sendCsvResponse(
    res,
    csvFilename('product-sales', period.start, period.end),
    [
      'Product ID',
      'Name',
      'Category',
      'Brand',
      'Units Sold',
      'Gross Revenue',
      'Orders',
      'Avg Unit Price',
    ],
    mapped.map((row) => [
      row.productId,
      row.name,
      row.category?.name ?? '',
      row.brand?.name ?? '',
      row.unitsSold,
      row.grossRevenue,
      row.orderCount,
      row.avgUnitPrice,
    ]),
  );
});

/**
 * @desc    Export single product sales timeseries as CSV
 * @route   GET /api/v1/reports/product-sales/:productId/export
 * @access  Admin (reports:read)
 */
export const exportSingleProductSalesCsv = asyncHandler(async (req, res, next) => {
  const { productId } = req.params;
  const { start, end } = resolveReportDateRange(req.query);
  const interval = req.query.interval === 'weekly' ? 'weekly' : 'daily';

  const product = await resolveProductHeader(productId);
  if (!product) {
    return next(new ApiError(`No product found with id: ${productId}`, 404));
  }

  const timeseries = await buildProductTimeseries(productId, start, end, interval);
  const period = formatReportPeriodIso(start, end);
  const safeName = String(product.name).replace(/[^\w\-]+/g, '-').slice(0, 40);

  sendCsvResponse(
    res,
    csvFilename(`product-sales-${safeName}`, period.start, period.end),
    ['Date', 'Units Sold', 'Gross Revenue', 'Orders'],
    timeseries.map((point) => [point.date, point.units, point.revenue, point.orders]),
  );
});
