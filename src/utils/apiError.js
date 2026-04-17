// src/utils/apiError.js

// Represents predictable, operational errors (e.g. 404, 401, 400).
// Non-operational errors (bugs, crashes) should NOT use this class.
class ApiError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    this.isOperational = true;
  }
}

export default ApiError;
