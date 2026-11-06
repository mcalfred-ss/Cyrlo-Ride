import rateLimit from 'express-rate-limit';

import { env } from '../../config/env.js';
import { AppError } from '../errors/app-error.js';

export const apiRateLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  limit: env.RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, _res, next) => {
    next(
      new AppError({
        status: 429,
        code: 'RATE_LIMITED',
        message: 'Too many requests',
      }),
    );
  },
});
