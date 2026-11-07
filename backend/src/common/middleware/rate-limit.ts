import type { Request } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';

import { env } from '../../config/env.js';
import { AppError } from '../errors/app-error.js';

/**
 * Rate-limit key uses Express-resolved `req.ip`, which respects `trust proxy`.
 * When TRUST_PROXY is false, spoofed X-Forwarded-For is ignored.
 * `ipKeyGenerator` normalizes IPv6 so dual-stack clients cannot bypass limits.
 */
function clientIpKey(req: Request): string {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  return ipKeyGenerator(ip);
}

export const apiRateLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  limit: env.RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: clientIpKey,
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

/** Tighter limiter for OTP request/verify endpoints (per resolved client IP). */
export const otpRateLimiter = rateLimit({
  windowMs: env.OTP_RATE_LIMIT_WINDOW_MS,
  limit: env.OTP_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: clientIpKey,
  handler: (_req, _res, next) => {
    next(
      new AppError({
        status: 429,
        code: 'RATE_LIMITED',
        message: 'Too many OTP requests. Try again later.',
      }),
    );
  },
});
