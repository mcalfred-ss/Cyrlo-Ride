import {
  LOCATION_CLOCK_SKEW_MS,
  RIDER_LOCATION_MAX_AGE_MS,
} from '../../config/constants.js';

export interface LocationFreshnessInput {
  /** Device-reported GPS time. */
  recordedAt: Date;
  /** Server time when the point was accepted. */
  receivedAt: Date;
  now: Date;
  maxAgeMs?: number;
  clockSkewMs?: number;
}

export interface LocationFreshnessResult {
  fresh: boolean;
  /** Age from server receipt; null when receivedAt is in the future relative to now. */
  serverAgeMs: number | null;
  reasons: Array<'DEVICE_TIMESTAMP_IN_FUTURE' | 'SERVER_AGE_EXCEEDED' | 'SERVER_TIMESTAMP_IN_FUTURE'>;
}

/**
 * Central GPS freshness rule.
 * Fresh only when the device timestamp is not beyond clock skew in the future
 * and the server-received age is within RIDER_LOCATION_MAX_AGE_MS (default 30s).
 */
export function evaluateLocationFreshness(input: LocationFreshnessInput): LocationFreshnessResult {
  const maxAgeMs = input.maxAgeMs ?? RIDER_LOCATION_MAX_AGE_MS;
  const clockSkewMs = input.clockSkewMs ?? LOCATION_CLOCK_SKEW_MS;
  const nowMs = input.now.getTime();
  const recordedMs = input.recordedAt.getTime();
  const receivedMs = input.receivedAt.getTime();
  const reasons: LocationFreshnessResult['reasons'] = [];

  if (recordedMs > nowMs + clockSkewMs) {
    reasons.push('DEVICE_TIMESTAMP_IN_FUTURE');
  }

  const serverAgeMs = nowMs - receivedMs;
  if (serverAgeMs < 0) {
    reasons.push('SERVER_TIMESTAMP_IN_FUTURE');
  } else if (serverAgeMs > maxAgeMs) {
    reasons.push('SERVER_AGE_EXCEEDED');
  }

  return {
    fresh: reasons.length === 0,
    serverAgeMs: serverAgeMs < 0 ? null : serverAgeMs,
    reasons,
  };
}

/**
 * Compatibility helper: treats `recordedAt` as the age basis (legacy domain tests).
 * Prefer `evaluateLocationFreshness` for operational checks (server-received age).
 */
export function isFreshLocation(
  recordedAt: Date,
  now: Date,
  maxAgeMs = RIDER_LOCATION_MAX_AGE_MS,
): boolean {
  const ageMs = now.getTime() - recordedAt.getTime();
  return ageMs >= 0 && ageMs <= maxAgeMs;
}

export function isOperationallyFreshLocation(
  input: Omit<LocationFreshnessInput, 'now'> & { now?: Date },
): boolean {
  return evaluateLocationFreshness({
    ...input,
    now: input.now ?? new Date(),
  }).fresh;
}
