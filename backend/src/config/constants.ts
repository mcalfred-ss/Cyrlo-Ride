export const APP_VERSION = '0.1.0';
export const API_PREFIX = '/api/v1';

/** GHS 1.00. Passenger booking fees are stored in pesewas. */
export const BOOKING_FEE_PESEWAS = 100;

/** Tokens removed when a rider accepts an eligible booking. */
export const TOKEN_COST_PER_ACCEPTANCE = 1;

/** Unpaid booking-fee deadline from booking creation. */
export const BOOKING_PAYMENT_TIMEOUT_MS = 10 * 60 * 1000;

/** Search window after fee SUCCESS (matching milestone). Stored on SEARCHING transition. */
export const BOOKING_SEARCH_TIMEOUT_MS = 5 * 60 * 1000;

/** Straight-line matching radius. Do not expand. */
export const MATCHING_RADIUS_METERS = 5_000;

/** Maximum riders offered in one dispatch batch. */
export const MATCHING_BATCH_SIZE = 3;

/** Rider GPS older than this is not eligible for matching / going online. */
export const RIDER_LOCATION_MAX_AGE_MS = 30_000;

/**
 * Allowed device-clock lead over server time when accepting recordedAt.
 * Larger future skew is rejected; there is no extended freshness fallback.
 */
export const LOCATION_CLOCK_SKEW_MS = 2_000;

/**
 * Approved retention for append-only trip GPS.
 * Latest-location rows are operational state, not the dispute trail.
 * Do not run destructive cleanup without legal-hold handling.
 */
export const TRIP_GPS_RETENTION_DAYS = 30;

/** Passenger/rider dispute submission window after COMPLETED or CANCELLED. */
export const DISPUTE_WINDOW_MS = 24 * 60 * 60 * 1000;

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

/** Conservative outbox retry defaults (overridable via env). */
export const NOTIFICATION_OUTBOX_MAX_ATTEMPTS_DEFAULT = 5;
export const NOTIFICATION_OUTBOX_BASE_BACKOFF_MS = 5_000;
export const NOTIFICATION_OUTBOX_MAX_BACKOFF_MS = 300_000;
export const NOTIFICATION_OUTBOX_POLL_MS_DEFAULT = 3_000;
export const NOTIFICATION_STALE_PROCESSING_MS_DEFAULT = 120_000;

/** Refund worker poll interval (API process). */
export const REFUND_WORKER_POLL_MS_DEFAULT = 10_000;
