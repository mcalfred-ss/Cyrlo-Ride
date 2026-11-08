import type { Request, RequestHandler } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';

import { env } from '../../config/env.js';
import { AppError } from '../errors/app-error.js';

/**
 * Rate-limit key uses Express-resolved `req.ip`, which respects `trust proxy`.
 * When TRUST_PROXY is false, spoofed X-Forwarded-For is ignored.
 * `ipKeyGenerator` normalizes IPv6 so dual-stack clients cannot bypass limits.
 */
export function clientIpKey(req: Request): string {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  return ipKeyGenerator(ip);
}

function rateLimitedHandler(message: string): RequestHandler {
  return (_req, _res, next) => {
    next(
      new AppError({
        status: 429,
        code: 'RATE_LIMITED',
        message,
      }),
    );
  };
}

/** General user-facing API traffic (excludes webhook + rider GPS update paths). */
export const apiRateLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  limit: env.RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: clientIpKey,
  handler: rateLimitedHandler('Too many requests'),
});

/** Tighter limiter for OTP request/verify endpoints (per resolved client IP). */
export const otpRateLimiter = rateLimit({
  windowMs: env.OTP_RATE_LIMIT_WINDOW_MS,
  limit: env.OTP_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: clientIpKey,
  handler: rateLimitedHandler('Too many OTP requests. Try again later.'),
});

/**
 * Paystack webhook abuse protection.
 * Isolated from the general API bucket so legitimate provider bursts cannot
 * starve passenger/rider traffic (and vice versa). Signature verification
 * remains mandatory on the webhook handler.
 */
export const paystackWebhookRateLimiter = rateLimit({
  windowMs: env.PAYSTACK_WEBHOOK_RATE_LIMIT_WINDOW_MS,
  limit: env.PAYSTACK_WEBHOOK_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: clientIpKey,
  handler: rateLimitedHandler('Too many webhook requests'),
});

/**
 * Rider GPS update limiter.
 * Prefer authenticated user id (carrier NAT safe); fall back to resolved IP
 * if somehow invoked without auth. Mount AFTER authenticate middleware.
 */
export const riderGpsRateLimiter = rateLimit({
  windowMs: env.RIDER_GPS_RATE_LIMIT_WINDOW_MS,
  limit: env.RIDER_GPS_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const userId = req.auth?.sub;
    if (userId) return `gps:user:${userId}`;
    return `gps:ip:${clientIpKey(req)}`;
  },
  handler: rateLimitedHandler('Too many location updates. Slow down.'),
});

/**
 * Paths on the `/api/v1` router that use a dedicated limiter instead of the
 * general API bucket. Keep this narrow: only Paystack webhook + rider GPS POST.
 */
export function usesDedicatedRateLimiter(path: string, method?: string): boolean {
  if (path === '/payments/paystack/webhook') return true;
  if (path === '/locations/rider' && (method === undefined || method.toUpperCase() === 'POST')) {
    return true;
  }
  return false;
}
