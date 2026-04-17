// src/app.js
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import morgan from 'morgan';
import ApiError from './utils/apiError.js';
import globalError from './middlewares/error.middleware.js';
import sendResponse from './utils/apiResponse.js';
import authRouter from './routes/auth.routes.js';
import userRouter from './routes/user.routes.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

const app = express();

app.use(express.json());
app.use(cookieParser());

if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

app.get('/', (req, res) => {
  sendResponse(res, { message: 'Oxxila API is up and running' });
});

// Serve the reset-password page with the token injected into window.__RESET_TOKEN__
// so the client script can use it without parsing the URL.
const resetPageTemplate = readFileSync(
  path.join(PUBLIC_DIR, 'reset-password.html'),
  'utf-8'
);
app.get('/reset-password/:token', (req, res) => {
  const safeToken = String(req.params.token).replace(/[^a-f0-9]/gi, '');
  const html = resetPageTemplate.replace(
    '<script>',
    `<script>window.__RESET_TOKEN__ = ${JSON.stringify(safeToken)};`
  );
  res.type('html').send(html);
});

// TODO: mount additional feature routers here (products, orders, …)
app.use('/api/v1/auth', authRouter);
app.use('/api/v1/users', userRouter);

app.all(/(.*)/, (req, res, next) => {
  next(new ApiError(`Route ${req.originalUrl} not found`, 404));
});

app.use(globalError);

export default app;
