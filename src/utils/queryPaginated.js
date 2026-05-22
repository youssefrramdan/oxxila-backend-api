// src/utils/queryPaginated.js
import ApiFeatures from './apiFeatures.js';

/**
 * Paginated list helper: filter, sort, optional search/fields, paginate, lean.
 */
export const queryPaginated = async (
  mongooseQuery,
  req,
  { searchFields = [], defaultSelect = null, populate = null } = {}
) => {
  const features = new ApiFeatures(mongooseQuery, req.query).filter().sort().limitFields();

  if (searchFields.length) features.search(searchFields);

  await features.paginate();

  let query = features.mongooseQuery;
  if (defaultSelect && !req.query.fields) {
    query = query.select(defaultSelect);
  }
  if (populate) {
    query = Array.isArray(populate) ? query.populate(populate) : query.populate(populate);
  }

  const data = await query.lean();
  const pagination = features.getPaginationResult();

  return { data, pagination: { ...pagination, results: data.length } };
};
