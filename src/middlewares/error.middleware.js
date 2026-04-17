// src/middlewares/error.middleware.js
import ApiError from '../utils/apiError.js';
import logger from '../config/logger.js';

// ─── JWT ────────────────────────────────────────────────────────────────────
const handleJwtError   = () => new ApiError('Invalid token, please login again.', 401);
const handleJwtExpired = () => new ApiError('Token expired, please login again.', 401);

// ─── Body Parser ─────────────────────────────────────────────────────────────
const handleSyntaxError = () => new ApiError('Invalid JSON in request body.', 400);

// ─── Multer (file uploads) ───────────────────────────────────────────────────
const MULTER_MESSAGES = {
  LIMIT_FILE_SIZE:       'Uploaded file is too large.',
  LIMIT_FILE_COUNT:      'Too many files uploaded.',
  LIMIT_UNEXPECTED_FILE: (err) => `Unexpected file field: ${err.field}`,
  LIMIT_PART_COUNT:      'Too many parts in the multipart payload.',
  LIMIT_FIELD_KEY:       'Field name is too long.',
  LIMIT_FIELD_VALUE:     'Field value is too long.',
  LIMIT_FIELD_COUNT:     'Too many fields in the multipart payload.',
};
const handleMulterError = (err) => {
  const mapped = MULTER_MESSAGES[err.code];
  const message = typeof mapped === 'function' ? mapped(err) : mapped ?? err.message;
  return new ApiError(message, 400);
};

// ─── Mongoose ────────────────────────────────────────────────────────────────

// Invalid ObjectId (e.g. /products/abc)
const handleCastError = (err) =>
  new ApiError(`Invalid ${err.path}: ${err.value}`, 400);

// Schema validation failed (required field missing, min/max, etc.)
const handleValidationError = (err) => {
  const messages = Object.values(err.errors).map((e) => e.message).join('. ');
  return new ApiError(`Validation failed: ${messages}`, 400);
};

// Duplicate unique field (e.g. email already exists)
const handleDuplicateKeyError = (err) => {
  const field = Object.keys(err.keyValue)[0];
  return new ApiError(`${field} already exists.`, 409);
};

// ─── Senders ─────────────────────────────────────────────────────────────────
const sendErrorDev = (err, res) =>
  res.status(err.statusCode).json({
    success: false,
    status:  err.status,
    message: err.message,
    stack:   err.stack,
    error:   err,
  });

const sendErrorProd = (err, res) =>
  res.status(err.statusCode).json({
    success: false,
    status:  err.status,
    message: err.message,
  });

// ─── Global Handler ───────────────────────────────────────────────────────────
const globalError = (err, req, res, next) => {
  // Normalize known error types before branching on environment
  if (err instanceof SyntaxError)         err = handleSyntaxError();
  if (err.name  === 'JsonWebTokenError')  err = handleJwtError();
  if (err.name  === 'TokenExpiredError')  err = handleJwtExpired();
  if (err.name  === 'CastError')          err = handleCastError(err);
  if (err.name  === 'ValidationError')    err = handleValidationError(err);
  if (err.name  === 'MulterError')        err = handleMulterError(err);
  if (err.code  === 11000)                err = handleDuplicateKeyError(err);

  err.statusCode = err.statusCode || 500;
  err.status     = err.status     || 'error';

  // Log only unexpected (non-operational) errors as errors; operational ones as warnings
  if (!err.isOperational) {
    logger.error(err.message, { stack: err.stack, statusCode: err.statusCode });
  } else {
    logger.warn(`${err.statusCode} - ${err.message} [${req.method} ${req.originalUrl}]`);
  }

  if (process.env.NODE_ENV === 'development') {
    sendErrorDev(err, res);
  } else {
    sendErrorProd(err, res);
  }
};

export default globalError;
