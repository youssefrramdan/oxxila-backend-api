// src/app.js
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import dotenv from 'dotenv';
import morgan from 'morgan';
import ApiError from './utils/apiError.js';
import globalError from './middlewares/error.middleware.js';
import sendResponse from './utils/apiResponse.js';
import passport from './config/passport.js';
import authRouter from './routes/auth.routes.js';
import userRouter from './routes/user.routes.js';
import categoryRouter from './routes/category.routes.js';
import subCategoryRouter from './routes/subCategory.routes.js';
import brandRouter from './routes/brand.routes.js';
import productRouter from './routes/product.routes.js';
import reviewRouter, { productReviewRouter } from './routes/review.routes.js';
import faqRouter, { productFaqRouter } from './routes/faq.routes.js';
import offerRouter from './routes/offer.routes.js';
import bannerRouter from './routes/banner.routes.js';
import couponRouter from './routes/coupon.routes.js';
import shippingAdminRouter from './routes/shipping.admin.routes.js';
import shippingRouter from './routes/shipping.routes.js';
import cartRouter from './routes/cart.routes.js';
import orderRouter from './routes/order.routes.js';
import returnRouter from './routes/return.routes.js';
import {
  stripeWebhook,
  paymobWebhook,
  paymobRedirect,
} from './controllers/payment.controller.js';
import { startOfferCron } from './utils/offerCron.js';

dotenv.config();

startOfferCron();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

const app = express();

// Comma-separated allowlist; default is local Angular (`ng serve` → :4200).
// On Heroku set CORS_ORIGIN to include this plus any deployed frontend URLs.
const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:4200')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, cb) => {
      // Browsers forbid Access-Control-Allow-Origin: * when credentials are sent.
      // Reflect only whitelisted origins (see CORS_ORIGIN).
      if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
      return cb(null, false);
    },
    credentials: true,
  })
);

// Stripe requires the raw body for signature verification.
app.post(
  '/api/v1/webhooks/stripe',
  express.raw({ type: 'application/json' }),
  stripeWebhook
);
app.get('/api/v1/webhooks/paymob', paymobRedirect);
app.post('/api/v1/webhooks/paymob', express.json(), paymobWebhook);

app.use(express.json());
app.use(cookieParser());
// Stateless Passport — only used by OAuth routes to populate req.user.
app.use(passport.initialize());

if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

app.get('/', (req, res) => {
  sendResponse(res, { message: 'Oxxila API is up and running' });
});

app.get('/reset-password/:token', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'reset-password.html'));
});

app.get('/admin-test.html', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'admin-test.html'));
});

app.get('/shipping-admin.html', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'shipping-admin.html'));
});

app.get('/cart-test.html', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'cart-test.html'));
});

app.get('/checkout-test.html', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'checkout-test.html'));
});

app.use(express.static(PUBLIC_DIR));

app.use('/api/v1/auth', authRouter);
app.use('/api/v1/users', userRouter);
app.use('/api/v1/categories', categoryRouter);
app.use('/api/v1/subcategories', subCategoryRouter);
app.use('/api/v1/brands', brandRouter);
app.use('/api/v1/products/:productId/reviews', productReviewRouter);
app.use('/api/v1/products/:productId/faqs', productFaqRouter);
app.use('/api/v1/products', productRouter);
app.use('/api/v1/reviews', reviewRouter);
app.use('/api/v1/faqs', faqRouter);
app.use('/api/v1/offers', offerRouter);
app.use('/api/v1/banners', bannerRouter);
app.use('/api/v1/coupons', couponRouter);
app.use('/api/v1/admin', shippingAdminRouter);
app.use('/api/v1/shipping', shippingRouter);
app.use('/api/v1/cart', cartRouter);
app.use('/api/v1/orders', orderRouter);
app.use('/api/v1/returns', returnRouter);

app.all(/(.*)/, (req, res, next) => {
  next(new ApiError(`Route ${req.originalUrl} not found`, 404));
});

app.use(globalError);

export default app;
