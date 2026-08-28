// src/validators/reports.validator.js
import { param, query } from 'express-validator';
import validate from '../middlewares/validate.middleware.js';

const periodQuery = query('period')
  .optional()
  .isInt({ min: 1, max: 365 })
  .withMessage('Period must be between 1 and 365 days')
  .toInt();

const dateRangeQuery = [
  query('startDate')
    .optional()
    .isISO8601({ strict: true, strictSeparator: true })
    .withMessage('startDate must be a valid ISO date (YYYY-MM-DD)'),
  query('endDate')
    .optional()
    .isISO8601({ strict: true, strictSeparator: true })
    .withMessage('endDate must be a valid ISO date (YYYY-MM-DD)'),
];

const listSortQuery = query('sort')
  .optional()
  .isIn(['-grossRevenue', 'grossRevenue', '-unitsSold', 'unitsSold', 'name', '-name'])
  .withMessage('Invalid sort field');

const paginationQuery = [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be at least 1').toInt(),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100')
    .toInt(),
];

const filterQuery = [
  query('search').optional().isString().trim().isLength({ max: 200 }),
  query('category').optional().isMongoId().withMessage('Invalid category id'),
  query('brand').optional().isMongoId().withMessage('Invalid brand id'),
];

export const productSalesListValidator = [
  periodQuery,
  ...dateRangeQuery,
  listSortQuery,
  ...paginationQuery,
  ...filterQuery,
  validate,
];

export const productSalesDetailValidator = [
  param('productId').isMongoId().withMessage('Invalid product id'),
  periodQuery,
  ...dateRangeQuery,
  query('interval')
    .optional()
    .isIn(['daily', 'weekly'])
    .withMessage('Interval must be daily or weekly'),
  validate,
];

export const productSalesExportValidator = [
  periodQuery,
  ...dateRangeQuery,
  listSortQuery,
  ...filterQuery,
  validate,
];

export const productSalesDetailExportValidator = [
  param('productId').isMongoId().withMessage('Invalid product id'),
  periodQuery,
  ...dateRangeQuery,
  query('interval')
    .optional()
    .isIn(['daily', 'weekly'])
    .withMessage('Interval must be daily or weekly'),
  validate,
];
