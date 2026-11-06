import { RIDER_LOCATION_MAX_AGE_MS } from '../../config/constants.js';

export function isFreshLocation(
  recordedAt: Date,
  now: Date,
  maxAgeMs = RIDER_LOCATION_MAX_AGE_MS,
): boolean {
  const ageMs = now.getTime() - recordedAt.getTime();
  return ageMs >= 0 && ageMs <= maxAgeMs;
}
