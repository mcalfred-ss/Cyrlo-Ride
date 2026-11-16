import { describe, expect, it } from 'vitest';

import type { AdminServiceZone, ServiceZoneStatus } from '../../api/types';
import {
  ASHANTI_BOUNDS,
  extractPolygonGeometry,
  filterZones,
  isInAshanti,
  selectAshantiMapZones,
  zonesToFeatureCollection,
  zoneStatusStyle,
} from './zoneMapHelpers';

const ring = [
  [-1.8, 6.6],
  [-1.7, 6.6],
  [-1.7, 6.7],
  [-1.8, 6.7],
  [-1.8, 6.6],
];

function zone(overrides: Partial<AdminServiceZone> & Pick<AdminServiceZone, 'id' | 'name'>): AdminServiceZone {
  return {
    communityId: null,
    districtId: `district-${overrides.id}`,
    slug: null,
    description: null,
    isActive: false,
    status: 'DRAFT',
    boundaryVerificationStatus: 'UNVERIFIED',
    geographicSource: null,
    geographicAttribution: null,
    geographicDatasetVersion: null,
    geographicShapeId: null,
    activatedAt: null,
    activatedById: null,
    suspendedAt: null,
    suspendedById: null,
    boundary: { type: 'Polygon', coordinates: [ring] },
    boundingBox: { minLongitude: -1.8, minLatitude: 6.6, maxLongitude: -1.7, maxLatitude: 6.7 },
    createdById: null,
    updatedById: null,
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('zoneStatusStyle', () => {
  it('gives each status group a distinct fill and stroke', () => {
    const statuses: ServiceZoneStatus[] = ['ACTIVE', 'UNDER_REVIEW', 'DRAFT', 'SUSPENDED'];
    const styles = statuses.map(zoneStatusStyle);
    expect(new Set(styles.map((s) => s.fill)).size).toBe(4);
    expect(new Set(styles.map((s) => s.stroke)).size).toBe(4);
    expect(styles.map((s) => s.group)).toEqual(['ACTIVE', 'UNDER_REVIEW', 'INACTIVE', 'SUSPENDED']);
  });

  it('treats DRAFT and LOCKED as the same inactive style', () => {
    expect(zoneStatusStyle('LOCKED')).toBe(zoneStatusStyle('DRAFT'));
    expect(zoneStatusStyle('LOCKED').group).toBe('INACTIVE');
  });

  it('uses green for ACTIVE and red for SUSPENDED', () => {
    expect(zoneStatusStyle('ACTIVE').fill).toBe('#16a34a');
    expect(zoneStatusStyle('SUSPENDED').fill).toBe('#dc2626');
  });
});

describe('extractPolygonGeometry', () => {
  it('accepts Polygon, MultiPolygon and Feature-wrapped geometry', () => {
    expect(extractPolygonGeometry({ type: 'Polygon', coordinates: [ring] })?.type).toBe('Polygon');
    expect(extractPolygonGeometry({ type: 'MultiPolygon', coordinates: [[ring]] })?.type).toBe(
      'MultiPolygon',
    );
    expect(
      extractPolygonGeometry({
        type: 'Feature',
        properties: {},
        geometry: { type: 'Polygon', coordinates: [ring] },
      })?.type,
    ).toBe('Polygon');
  });

  it('rejects missing or malformed boundaries', () => {
    expect(extractPolygonGeometry(null)).toBeNull();
    expect(extractPolygonGeometry({ type: 'Point', coordinates: [0, 0] })).toBeNull();
    expect(extractPolygonGeometry({ type: 'Polygon', coordinates: [[[0, 0]]] })).toBeNull();
    expect(extractPolygonGeometry({ type: 'Polygon', coordinates: 'x' })).toBeNull();
  });
});

describe('zone collections and filters', () => {
  const atwima = zone({
    id: 'z-atwima',
    name: 'Atwima Kwanwoma',
    status: 'ACTIVE',
    isActive: true,
    boundaryVerificationStatus: 'VERIFIED',
  });
  const draft = zone({ id: 'z-draft', name: 'Ejisu' });
  const noBoundary = zone({ id: 'z-none', name: 'No Boundary', boundary: null });
  const elsewhere = zone({
    id: 'z-far',
    name: 'Far Away',
    boundingBox: { minLongitude: 10, minLatitude: 10, maxLongitude: 11, maxLatitude: 11 },
  });

  it('builds features coloured by status and skips zones without a polygon', () => {
    const fc = zonesToFeatureCollection([atwima, draft, noBoundary]);
    expect(fc.features).toHaveLength(2);
    expect(fc.features[0].properties).toMatchObject({
      zoneId: 'z-atwima',
      name: 'Atwima Kwanwoma',
      fill: zoneStatusStyle('ACTIVE').fill,
    });
    expect(fc.features[1].properties.fill).toBe(zoneStatusStyle('DRAFT').fill);
  });

  it('keeps only zones that have a polygon inside the Ashanti extent', () => {
    expect(isInAshanti(atwima)).toBe(true);
    expect(isInAshanti(elsewhere)).toBe(false);
    expect(ASHANTI_BOUNDS).toEqual([-2.45, 5.85, -0.2, 7.65]);
    expect(
      selectAshantiMapZones([atwima, draft, noBoundary, elsewhere]).map((z) => z.id),
    ).toEqual(['z-atwima', 'z-draft']);
  });

  it('filters by name search and status, sorted by name', () => {
    const all = [draft, atwima];
    expect(filterZones(all, { q: '', status: '' }).map((z) => z.name)).toEqual([
      'Atwima Kwanwoma',
      'Ejisu',
    ]);
    expect(filterZones(all, { q: 'atwi', status: '' }).map((z) => z.id)).toEqual(['z-atwima']);
    expect(filterZones(all, { q: '', status: 'DRAFT' }).map((z) => z.id)).toEqual(['z-draft']);
    expect(filterZones(all, { q: 'atwi', status: 'DRAFT' })).toEqual([]);
  });
});
