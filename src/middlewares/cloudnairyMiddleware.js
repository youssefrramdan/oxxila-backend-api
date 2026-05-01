// src/middlewares/cloudnairyMiddleware.js
import multer from 'multer';
import { v2 as cloudinary } from 'cloudinary';
import { CloudinaryStorage } from 'multer-storage-cloudinary';
import ApiError from '../utils/apiError.js';
import logger from '../config/logger.js';
import dotenv from 'dotenv';
dotenv.config();
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const DEFAULT_ALLOWED_FORMATS = [
  'jpeg', 'jpg', 'png', 'pdf',
  'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
];

const getExt = (name) => name.split('.').pop().toLowerCase();
const getBase = (name) => name.replace(/\.[^.]+$/, '');

/** Strip chars Cloudinary / URLs reject from uploaded filenames (e.g. `Logo & Typo.png`). */
const sanitizePublicIdSegment = (filename) => {
  const base = getBase(filename);
  const cleaned = base
    .normalize('NFKC')
    .replace(/[\s&+#?%\\*:|"<>]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return (cleaned || 'upload').slice(0, 200);
};

/**
 * Build a multer instance that uploads to a Cloudinary folder.
 *
 * @param {string} folder                  Cloudinary folder to store assets in.
 * @param {object} [opts]
 * @param {string[]} [opts.allowedFormats] Accepted extensions (lowercase, no dot).
 * @param {number}   [opts.maxFileSizeMB]  Hard limit per file, default 5 MB.
 */
const createUploader = (folder, opts = {}) => {
  const {
    allowedFormats = DEFAULT_ALLOWED_FORMATS,
    maxFileSizeMB = 15,
  } = opts;

  const storage = new CloudinaryStorage({
    cloudinary,
    params: {
      folder,
      public_id: (req, file) =>
        `${file.fieldname}-${Date.now()}-${sanitizePublicIdSegment(file.originalname)}`,
      format: async (req, file) => {
        const ext = getExt(file.originalname);
        if (allowedFormats.includes(ext)) return ext;
        // Thrown errors propagate through multer to the global error handler.
        throw new ApiError(
          `Unsupported file format ".${ext}". Allowed: ${allowedFormats.join(', ')}`,
          400
        );
      },
    },
  });

  return multer({
    storage,
    limits: { fileSize: maxFileSizeMB * 1024 * 1024 },
  });
};

/**
 * Best-effort deletion of a Cloudinary asset. Never throws — used in
 * "replace then cleanup" flows where a failed delete shouldn't fail the request.
 */
export const deleteAsset = async (publicId) => {
  if (!publicId) return;
  try {
    await cloudinary.uploader.destroy(publicId);
  } catch (err) {
    logger.warn(`Cloudinary destroy failed for "${publicId}": ${err.message}`);
  }
};

export default createUploader;
