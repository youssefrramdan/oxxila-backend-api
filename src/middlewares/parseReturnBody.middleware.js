// src/middlewares/parseReturnBody.middleware.js
import ApiError from "../utils/apiError.js";

/** Parse `items[0][orderItemId]` / `pickupAddress[city]` into nested objects. */
const pathParts = (key) => {
  const parts = [];
  const re = /([^[\]]+)|\[([^\]]*)\]/g;
  let m;
  while ((m = re.exec(key))) parts.push(m[1] ?? m[2]);
  return parts;
};

const setPath = (obj, parts, value) => {
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i];
    const next = parts[i + 1];
    const asArray = /^\d+$/.test(next);
    if (cur[p] == null) cur[p] = asArray ? [] : {};
    cur = cur[p];
  }
  cur[parts[parts.length - 1]] = value;
};

/** Nest multer flat bracket keys; leave already-nested JSON bodies alone. */
const nestFlatBody = (flat) => {
  const out = {};
  for (const [key, value] of Object.entries(flat)) {
    if (!key.includes("[")) {
      out[key] = value;
      continue;
    }
    setPath(out, pathParts(key), value);
  }
  return out;
};

/** Normalize multipart bracket fields before express-validator runs. */
export const parseReturnBody = (req, _res, next) => {
  try {
    const hasBracketKeys = Object.keys(req.body).some((k) => k.includes("["));
    if (hasBracketKeys) {
      req.body = nestFlatBody(req.body);
    }

    if (Array.isArray(req.body.order)) {
      req.body.order = req.body.order[0];
    }
    if (typeof req.body.order === "string") {
      req.body.order = req.body.order.trim();
    }

    if (req.body.items != null && !Array.isArray(req.body.items)) {
      req.body.items = [req.body.items];
    }
    if (!Array.isArray(req.body.items)) {
      req.body.items = [];
    }
  } catch {
    return next(new ApiError("Invalid return form body", 400));
  }
  next();
};
