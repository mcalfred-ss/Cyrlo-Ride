import type { BookingsService } from '../modules/bookings/module.service.js';
import { logger } from '../config/logger.js';

/**
 * Periodic unpaid booking-fee timeout worker.
 * Safe to run concurrently with webhooks (status transitions are conditional).
 * Operational requirement: keep the API process running, or invoke
 * `bookings.expireUnpaidBookings()` from an external scheduler every minute.
 */
export function startUnpaidBookingExpiryWorker(
  bookings: BookingsService,
  intervalMs = 30_000,
): NodeJS.Timeout {
  const tick = () => {
    void bookings.expireUnpaidBookings().then(
      (result) => {
        if (result.expired > 0) {
          logger.info({ expired: result.expired }, 'expired unpaid bookings');
        }
      },
      (error: unknown) => {
        logger.error({ err: error }, 'unpaid booking expiry failed');
      },
    );
  };
  tick();
  const handle = setInterval(tick, intervalMs);
  handle.unref();
  return handle;
}
