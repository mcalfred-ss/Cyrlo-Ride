import { env } from '../../config/env.js';
import { AppError } from '../../common/errors/app-error.js';

/**
 * Offer response timeout must be explicitly configured.
 * GPS freshness (30s) is not a substitute.
 */
export function requireOfferResponseTimeoutSeconds(
  source: { RIDER_OFFER_RESPONSE_TIMEOUT_SECONDS?: number } = env,
): number {
  const value = source.RIDER_OFFER_RESPONSE_TIMEOUT_SECONDS;
  if (value === undefined || value === null || !Number.isFinite(value) || value <= 0) {
    throw new AppError({
      status: 503,
      code: 'SERVICE_UNAVAILABLE',
      message:
        'Matching dispatch is disabled until RIDER_OFFER_RESPONSE_TIMEOUT_SECONDS is explicitly configured',
    });
  }
  return Math.trunc(value);
}

export function offerExpiresAt(now: Date, timeoutSeconds: number): Date {
  return new Date(now.getTime() + timeoutSeconds * 1000);
}
