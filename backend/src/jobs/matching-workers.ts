import type { MatchingService } from '../modules/matching/module.service.js';
import { logger } from '../config/logger.js';

/**
 * Periodic matching dispatch + offer/search expiry.
 * Requires RIDER_OFFER_RESPONSE_TIMEOUT_SECONDS; otherwise dispatch fails closed.
 */
export function startMatchingWorkers(
  matching: MatchingService,
  intervalMs = 5_000,
): NodeJS.Timeout {
  const tick = () => {
    void matching
      .expireOffersAndSearches()
      .then(() => matching.dispatchOpenBookings())
      .catch((error: unknown) => {
        logger.warn({ err: error }, 'matching worker tick failed');
      });
  };
  tick();
  const handle = setInterval(tick, intervalMs);
  handle.unref();
  return handle;
}
