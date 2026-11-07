import { AppError } from '../../common/errors/app-error.js';
import { MATCHING_RADIUS_METERS } from '../../config/constants.js';

const EARTH_RADIUS_METERS = 6_371_000;

function assertCoordinate(latitude: number, longitude: number): void {
  if (
    typeof latitude !== 'number' ||
    typeof longitude !== 'number' ||
    Number.isNaN(latitude) ||
    Number.isNaN(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    throw new AppError({
      status: 400,
      code: 'VALIDATION_ERROR',
      message: 'Coordinates must be valid latitude/longitude numbers',
    });
  }
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/**
 * Straight-line (great-circle) distance in metres using the Haversine formula.
 * Not road distance. Destination is never used for matching.
 */
export function haversineDistanceMeters(
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number },
): number {
  assertCoordinate(from.latitude, from.longitude);
  assertCoordinate(to.latitude, to.longitude);
  const lat1 = toRadians(from.latitude);
  const lat2 = toRadians(to.latitude);
  const dLat = lat2 - lat1;
  const dLon = toRadians(to.longitude - from.longitude);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_METERS * c;
}

/** Exactly MATCHING_RADIUS_METERS is inside; anything greater is outside. */
export function isWithinMatchingRadius(
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number },
  radiusMeters = MATCHING_RADIUS_METERS,
): boolean {
  return haversineDistanceMeters(from, to) <= radiusMeters;
}
