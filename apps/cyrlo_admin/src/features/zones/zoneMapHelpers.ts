import type { AdminServiceZone, ServiceZoneStatus } from '../../api/types';

/**
 * Approximate Ashanti Region extent: [west, south, east, north] (lng/lat).
 * East/north include Sekyere Afram Plains North (~-0.24°, ~7.62°).
 */
export const ASHANTI_BOUNDS: readonly [number, number, number, number] = [-2.45, 5.85, -0.2, 7.65];

export const ASHANTI_REGION_LABEL = 'Ashanti Region';

export type ZoneStatusGroup = 'ACTIVE' | 'INACTIVE' | 'UNDER_REVIEW' | 'SUSPENDED';

export interface ZoneStatusStyle {
  group: ZoneStatusGroup;
  /** Legend / badge label. */
  label: string;
  fill: string;
  stroke: string;
}

const STYLE_ACTIVE: ZoneStatusStyle = {
  group: 'ACTIVE',
  label: 'Active',
  fill: '#16a34a',
  stroke: '#166534',
};
const STYLE_INACTIVE: ZoneStatusStyle = {
  group: 'INACTIVE',
  label: 'Draft / locked (inactive)',
  fill: '#94a3b8',
  stroke: '#475569',
};
const STYLE_REVIEW: ZoneStatusStyle = {
  group: 'UNDER_REVIEW',
  label: 'Under review',
  fill: '#f59e0b',
  stroke: '#b45309',
};
const STYLE_SUSPENDED: ZoneStatusStyle = {
  group: 'SUSPENDED',
  label: 'Suspended',
  fill: '#dc2626',
  stroke: '#991b1b',
};

/** Legend order. */
export const ZONE_STATUS_LEGEND: readonly ZoneStatusStyle[] = [
  STYLE_ACTIVE,
  STYLE_REVIEW,
  STYLE_INACTIVE,
  STYLE_SUSPENDED,
];

/** Maps a lifecycle status to its map colours. DRAFT and LOCKED share the "inactive" look. */
export function zoneStatusStyle(status: ServiceZoneStatus): ZoneStatusStyle {
  switch (status) {
    case 'ACTIVE':
      return STYLE_ACTIVE;
    case 'UNDER_REVIEW':
      return STYLE_REVIEW;
    case 'SUSPENDED':
      return STYLE_SUSPENDED;
    case 'DRAFT':
    case 'LOCKED':
    default:
      return STYLE_INACTIVE;
  }
}

export type PolygonGeometry =
  | { type: 'Polygon'; coordinates: number[][][] }
  | { type: 'MultiPolygon'; coordinates: number[][][][] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isPosition(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.length >= 2 &&
    typeof value[0] === 'number' &&
    typeof value[1] === 'number' &&
    Number.isFinite(value[0]) &&
    Number.isFinite(value[1])
  );
}

function isRing(value: unknown): boolean {
  return Array.isArray(value) && value.length >= 4 && value.every(isPosition);
}

function isPolygonCoords(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0 && value.every(isRing);
}

/**
 * Extracts a Polygon/MultiPolygon geometry from the API `boundary` value, which may be a bare
 * geometry or a GeoJSON Feature. Returns null for anything missing or malformed.
 */
export function extractPolygonGeometry(boundary: unknown): PolygonGeometry | null {
  if (!isRecord(boundary)) return null;
  if (boundary.type === 'Feature') return extractPolygonGeometry(boundary.geometry);
  if (boundary.type === 'Polygon' && isPolygonCoords(boundary.coordinates)) {
    return { type: 'Polygon', coordinates: boundary.coordinates as number[][][] };
  }
  if (
    boundary.type === 'MultiPolygon' &&
    Array.isArray(boundary.coordinates) &&
    boundary.coordinates.length > 0 &&
    boundary.coordinates.every(isPolygonCoords)
  ) {
    return { type: 'MultiPolygon', coordinates: boundary.coordinates as number[][][][] };
  }
  return null;
}

export interface ZoneFeatureProperties {
  zoneId: string;
  name: string;
  status: ServiceZoneStatus;
  fill: string;
  stroke: string;
}

export interface ZoneFeature {
  type: 'Feature';
  geometry: PolygonGeometry;
  properties: ZoneFeatureProperties;
}

export interface ZoneFeatureCollection {
  type: 'FeatureCollection';
  features: ZoneFeature[];
}

export function zonesToFeatureCollection(zones: readonly AdminServiceZone[]): ZoneFeatureCollection {
  const features: ZoneFeature[] = [];
  for (const zone of zones) {
    const geometry = extractPolygonGeometry(zone.boundary);
    if (!geometry) continue;
    const style = zoneStatusStyle(zone.status);
    features.push({
      type: 'Feature',
      geometry,
      properties: {
        zoneId: zone.id,
        name: zone.name,
        status: zone.status,
        fill: style.fill,
        stroke: style.stroke,
      },
    });
  }
  return { type: 'FeatureCollection', features };
}

/** [west, south, east, north] from the API bounding box, or null if it is not finite. */
export function zoneBounds(zone: AdminServiceZone): [number, number, number, number] | null {
  const b = zone.boundingBox;
  if (!b) return null;
  const values = [b.minLongitude, b.minLatitude, b.maxLongitude, b.maxLatitude];
  if (!values.every((v) => typeof v === 'number' && Number.isFinite(v))) return null;
  return [b.minLongitude, b.minLatitude, b.maxLongitude, b.maxLatitude];
}

/** True when the zone's bounding box overlaps the Ashanti Region extent. */
export function isInAshanti(zone: AdminServiceZone): boolean {
  const bounds = zoneBounds(zone);
  if (!bounds) return false;
  const [w, s, e, n] = bounds;
  const [aw, as, ae, an] = ASHANTI_BOUNDS;
  return w <= ae && e >= aw && s <= an && n >= as;
}

/** Zones that can be drawn on the Ashanti map: have a valid polygon inside the region extent. */
export function selectAshantiMapZones(zones: readonly AdminServiceZone[]): AdminServiceZone[] {
  return zones.filter((z) => extractPolygonGeometry(z.boundary) !== null && isInAshanti(z));
}

export interface ZoneDirectoryFilter {
  q: string;
  status: ServiceZoneStatus | '';
}

export function filterZones(
  zones: readonly AdminServiceZone[],
  filter: ZoneDirectoryFilter,
): AdminServiceZone[] {
  const q = filter.q.trim().toLowerCase();
  return zones
    .filter((z) => (filter.status ? z.status === filter.status : true))
    .filter((z) => (q ? z.name.toLowerCase().includes(q) : true))
    .sort((a, b) => a.name.localeCompare(b.name));
}
