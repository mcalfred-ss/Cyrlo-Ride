import type { Coordinates } from '../../common/schemas/coordinates.js';

export interface BoundingBox {
  minLatitude: number;
  maxLatitude: number;
  minLongitude: number;
  maxLongitude: number;
}

/** GeoJSON positions are [longitude, latitude]. */
export function isPointInRing(
  latitude: number,
  longitude: number,
  ring: readonly (readonly [number, number])[],
): boolean {
  if (ring.length < 3) return false;
  let inside = false;
  for (let index = 0, previousIndex = ring.length - 1; index < ring.length; previousIndex = index++) {
    const current = ring[index];
    const previous = ring[previousIndex];
    if (!current || !previous) continue;
    const currentLongitude = current[0];
    const currentLatitude = current[1];
    const previousLongitude = previous[0];
    const previousLatitude = previous[1];
    const crossesLatitude = currentLatitude > latitude !== previousLatitude > latitude;
    if (!crossesLatitude || previousLatitude === currentLatitude) continue;
    const intersectionLongitude =
      ((previousLongitude - currentLongitude) * (latitude - currentLatitude)) /
        (previousLatitude - currentLatitude) +
      currentLongitude;
    if (longitude < intersectionLongitude) inside = !inside;
  }
  return inside;
}

export function isInsideBoundingBox(point: Coordinates, box: BoundingBox): boolean {
  return (
    point.latitude >= box.minLatitude &&
    point.latitude <= box.maxLatitude &&
    point.longitude >= box.minLongitude &&
    point.longitude <= box.maxLongitude
  );
}
