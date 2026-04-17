// src/utils/apiFeatures.js

/**
 * Chainable query-building helper around a Mongoose query.
 *
 * Usage:
 *   const features = new ApiFeatures(User.find(), req.query)
 *     .filter()
 *     .search(['name', 'email'])
 *     .sort()
 *     .limitFields();
 *   await features.paginate();
 *   const docs = await features.mongooseQuery;
 *   const pagination = features.getPaginationResult();
 */
class ApiFeatures {
  constructor(mongooseQuery, queryString) {
    this.mongooseQuery = mongooseQuery;
    this.queryString = queryString;
    this.paginationResult = null;
  }

  filter() {
    const queryObj = { ...this.queryString };
    ['page', 'limit', 'sort', 'fields', 'keyword'].forEach((k) => delete queryObj[k]);

    // Support Mongo operators written like ?price[gt]=10  →  { price: { $gt: 10 } }
    let queryStr = JSON.stringify(queryObj);
    queryStr = queryStr.replace(/\b(gte|gt|lte|lt|in|nin|ne)\b/g, (m) => `$${m}`);

    this.mongooseQuery = this.mongooseQuery.find(JSON.parse(queryStr));
    return this;
  }

  search(fields = []) {
    const { keyword } = this.queryString;
    if (!keyword || !fields.length) return this;

    const regex = { $regex: keyword, $options: 'i' };
    this.mongooseQuery = this.mongooseQuery.find({
      $or: fields.map((f) => ({ [f]: regex })),
    });
    return this;
  }

  sort() {
    if (this.queryString.sort) {
      const sortBy = this.queryString.sort.split(',').join(' ');
      this.mongooseQuery = this.mongooseQuery.sort(sortBy);
    } else {
      this.mongooseQuery = this.mongooseQuery.sort('-createdAt');
    }
    return this;
  }

  limitFields() {
    if (this.queryString.fields) {
      const fields = this.queryString.fields.split(',').join(' ');
      this.mongooseQuery = this.mongooseQuery.select(fields);
    } else {
      this.mongooseQuery = this.mongooseQuery.select('-__v');
    }
    return this;
  }

  async paginate() {
    const page = Math.max(Number(this.queryString.page) || 1, 1);
    const limit = Math.min(Math.max(Number(this.queryString.limit) || 10, 1), 100);
    const skip = (page - 1) * limit;

    // Clone the filter/search conditions to count total matching docs.
    const totalDocuments = await this.mongooseQuery.model.countDocuments(
      this.mongooseQuery.getFilter()
    );

    this.mongooseQuery = this.mongooseQuery.skip(skip).limit(limit);
    this.paginationResult = {
      currentPage: page,
      limit,
      numberOfPages: Math.ceil(totalDocuments / limit),
      totalDocuments,
      nextPage: skip + limit < totalDocuments ? page + 1 : null,
      prevPage: page > 1 ? page - 1 : null,
    };
    return this;
  }

  getPaginationResult() {
    return this.paginationResult;
  }
}

export default ApiFeatures;
