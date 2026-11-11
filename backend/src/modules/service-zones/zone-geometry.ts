import { AppError } from '../../common/errors/app-error.js';
import type { Coordinates } from '../../common/schemas/coordinates.js';

export interface BoundingBox {
  minLatitude: number;
  maxLatitude: number;
  minLongitude: number;
  maxLongitude: number;
}

export type GeoJsonPosition = readonly [number, number];

export interface GeoJsonPolygon {
  type: 'Polygon';
  coordinates: GeoJsonPosition[][];
}

export interface GeoJsonMultiPolygon {
  type: 'MultiPolygon';
  coordinates: GeoJsonPosition[][][];
}

export type ZoneBoundary = GeoJsonPolygon | GeoJsonMultiPolygon;

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

export function isPointInBoundary(
  latitude: number,
  longitude: number,
  boundary: ZoneBoundary,
): boolean {
  if (boundary.type === 'Polygon') {
    return isPointInPolygon(latitude, longitude, boundary.coordinates);
  }
  return boundary.coordinates.some((polygon) => isPointInPolygon(latitude, longitude, polygon));
}

function isPointInPolygon(
  latitude: number,
  longitude: number,
  polygon: readonly (readonly GeoJsonPosition[])[],
): boolean {
  const outer = polygon[0];
  if (!outer || !isPointInRing(latitude, longitude, outer)) return false;
  for (let i = 1; i < polygon.length; i += 1) {
    const hole = polygon[i];
    if (hole && isPointInRing(latitude, longitude, hole)) return false;
  }
  return true;
}

/** Soft cap to keep point-in-polygon checks and admin payloads bounded. */
export const MAX_BOUNDARY_VERTICES = 5_000;

/**
 * Validates GeoJSON Polygon/MultiPolygon for zone storage.
 * Does not invent coordinates — callers must supply verified boundaries.
 * Does not claim full self-intersection detection (not supported by this validator).
 */
export function validateAndNormalizeBoundary(input: unknown): {
  boundary: ZoneBoundary;
  boundingBox: BoundingBox;
  vertexCount: number;
} {
  if (!input || typeof input !== 'object') {
    throw geometryError('Boundary must be a GeoJSON object');
  }
  const candidate = input as { type?: unknown; coordinates?: unknown };
  if (candidate.type !== 'Polygon' && candidate.type !== 'MultiPolygon') {
    throw geometryError('Boundary type must be Polygon or MultiPolygon');
  }

  if (candidate.type === 'Polygon') {
    const coordinates = assertPolygonCoordinates(candidate.coordinates);
    const vertexCount = countVertices([coordinates]);
    assertVertexBudget(vertexCount);
    return {
      boundary: { type: 'Polygon', coordinates },
      boundingBox: boundingBoxFromPolygons([coordinates]),
      vertexCount,
    };
  }

  if (!Array.isArray(candidate.coordinates) || candidate.coordinates.length === 0) {
    throw geometryError('MultiPolygon must include at least one polygon');
  }
  const coordinates = candidate.coordinates.map((polygon) => assertPolygonCoordinates(polygon));
  const vertexCount = countVertices(coordinates);
  assertVertexBudget(vertexCount);
  return {
    boundary: { type: 'MultiPolygon', coordinates },
    boundingBox: boundingBoxFromPolygons(coordinates),
    vertexCount,
  };
}

export function boundingBoxArea(box: BoundingBox): number {
  return Math.max(0, box.maxLatitude - box.minLatitude) * Math.max(0, box.maxLongitude - box.minLongitude);
}

function countVertices(polygons: GeoJsonPosition[][][]): number {
  let count = 0;
  for (const polygon of polygons) {
    for (const ring of polygon) {
      // Closed rings repeat the first vertex; count unique ring positions for budget.
      count += Math.max(0, ring.length - 1);
    }
  }
  return count;
}

function assertVertexBudget(vertexCount: number): void {
  if (vertexCount > MAX_BOUNDARY_VERTICES) {
    throw geometryError(
      `Boundary exceeds maximum of ${MAX_BOUNDARY_VERTICES} vertices (got ${vertexCount})`,
    );
  }
}

function assertPolygonCoordinates(value: unknown): GeoJsonPosition[][] {
  if (!Array.isArray(value) || value.length === 0) {
    throw geometryError('Polygon must include an exterior ring');
  }
  return value.map((ring, ringIndex) => assertRing(ring, ringIndex === 0 ? 'exterior' : 'hole'));
}

function assertRing(value: unknown, label: string): GeoJsonPosition[] {
  if (!Array.isArray(value) || value.length < 4) {
    throw geometryError(`Polygon ${label} ring must contain at least 4 positions`);
  }
  const positions: GeoJsonPosition[] = value.map((position, index) =>
    assertPosition(position, `${label}[${index}]`),
  );
  const first = positions[0]!;
  const last = positions[positions.length - 1]!;
  if (first[0] !== last[0] || first[1] !== last[1]) {
    throw geometryError(`Polygon ${label} ring must be closed (first point equals last point)`);
  }
  const unique = new Set(positions.slice(0, -1).map((point) => `${point[0]},${point[1]}`));
  if (unique.size < 3) {
    throw geometryError(`Polygon ${label} ring must contain at least 3 distinct positions`);
  }
  return positions;
}

function assertPosition(value: unknown, label: string): GeoJsonPosition {
  if (!Array.isArray(value) || value.length < 2) {
    throw geometryError(`Position ${label} must be [longitude, latitude]`);
  }
  const longitude = value[0];
  const latitude = value[1];
  if (typeof longitude !== 'number' || Number.isNaN(longitude) || longitude < -180 || longitude > 180) {
    throw geometryError(`Longitude at ${label} must be a number between -180 and 180`);
  }
  if (typeof latitude !== 'number' || Number.isNaN(latitude) || latitude < -90 || latitude > 90) {
    throw geometryError(`Latitude at ${label} must be a number between -90 and 90`);
  }
  return [longitude, latitude];
}

function boundingBoxFromPolygons(polygons: GeoJsonPosition[][][]): BoundingBox {
  let minLatitude = 90;
  let maxLatitude = -90;
  let minLongitude = 180;
  let maxLongitude = -180;
  for (const polygon of polygons) {
    for (const ring of polygon) {
      for (const [longitude, latitude] of ring) {
        minLatitude = Math.min(minLatitude, latitude);
        maxLatitude = Math.max(maxLatitude, latitude);
        minLongitude = Math.min(minLongitude, longitude);
        maxLongitude = Math.max(maxLongitude, longitude);
      }
    }
  }
  return { minLatitude, maxLatitude, minLongitude, maxLongitude };
}

function geometryError(message: string): AppError {
  return new AppError({
    status: 400,
    code: 'VALIDATION_ERROR',
    message,
  });
}
