// src/utils/apiResponse.js

/**
 * Sends a standardized success response.
 * All success responses across the API must go through this function
 * to guarantee a consistent shape for the frontend.
 *
 * Shape: { success, statusCode, message, data?, pagination? }
 */
const sendResponse = (res, { statusCode = 200, message = 'Success', data = null, pagination = null } = {}) => {
  const body = { success: true, statusCode, message };

  if (data !== null) body.data = data;
  if (pagination !== null) body.pagination = pagination;

  return res.status(statusCode).json(body);
};

export default sendResponse;

