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

dotenv.config();

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

app.use(express.json());
app.use(cookieParser());
// Stateless Passport — only used by Google OAuth routes to populate req.user.
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

// TODO: mount additional feature routers here (products, orders, …)
app.use('/api/v1/auth', authRouter);
app.use('/api/v1/users', userRouter);

app.all(/(.*)/, (req, res, next) => {
  next(new ApiError(`Route ${req.originalUrl} not found`, 404));
});

app.use(globalError);

export default app;
