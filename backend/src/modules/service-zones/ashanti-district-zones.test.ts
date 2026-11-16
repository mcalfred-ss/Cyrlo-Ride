import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { MemoryServiceZonesRepository } from './memory-service-zones-repository.js';
import { ServiceZonesServiceImpl } from './module.service.js';
import { validateAndNormalizeBoundary } from './zone-geometry.js';

const GEOJSON_PATH = resolve(
  process.cwd(),
  '../ops/geo/ashanti/ashanti-districts-adm2.geojson',
);

const SOURCE_PATH = resolve(process.cwd(), '../ops/geo/ashanti/SOURCE.json');

type AshantiFc = {
  attribution: {
    license: string;
    source: string;
    dataset: string;
  };
  features: Array<{
    properties: {
      catalogueId: string;
      catalogueName: string;
      zoneSlug: string;
      shapeID: string;
      shapeName: string;
    };
    geometry: unknown;
  }>;
};

function loadAshanti(): AshantiFc {
  return JSON.parse(readFileSync(GEOJSON_PATH, 'utf8')) as AshantiFc;
}

function squareAround(lng: number, lat: number, delta = 0.01) {
  return {
    type: 'Polygon' as const,
    coordinates: [
      [
        [lng - delta, lat - delta],
        [lng + delta, lat - delta],
        [lng + delta, lat + delta],
        [lng - delta, lat + delta],
        [lng - delta, lat - delta],
      ],
    ],
  };
}

describe('Ashanti district geo dataset', () => {
  it('contains exactly 43 reconciled districts with valid boundaries', () => {
    const fc = loadAshanti();
    expect(fc.features).toHaveLength(43);

    const catalogueIds = new Set<string>();
    const shapeIds = new Set<string>();
    const slugs = new Set<string>();

    for (const feature of fc.features) {
      const { boundary, boundingBox } = validateAndNormalizeBoundary(feature.geometry);
      expect(['Polygon', 'MultiPolygon']).toContain(boundary.type);
      expect(boundingBox.minLatitude).toBeLessThanOrEqual(boundingBox.maxLatitude);
      expect(boundingBox.minLongitude).toBeLessThanOrEqual(boundingBox.maxLongitude);
      // Ashanti extent sanity — reject Accra (~5.6, -0.2) and inventing country-wide spans
      expect(boundingBox.minLatitude).toBeGreaterThan(5.7);
      expect(boundingBox.maxLatitude).toBeLessThan(7.7);
      expect(boundingBox.minLongitude).toBeGreaterThan(-2.7);
      // Sekyere Afram Plains North extends east of -0.6°; Accra (~-0.19) is still outside.
      expect(boundingBox.maxLongitude).toBeLessThan(-0.2);

      expect(catalogueIds.has(feature.properties.catalogueId)).toBe(false);
      expect(shapeIds.has(feature.properties.shapeID)).toBe(false);
      expect(slugs.has(feature.properties.zoneSlug)).toBe(false);
      catalogueIds.add(feature.properties.catalogueId);
      shapeIds.add(feature.properties.shapeID);
      slugs.add(feature.properties.zoneSlug);
    }

    expect(slugs.has('atwima-kwanwoma')).toBe(true);
    expect(fc.features.some((f) => /accra|ga east|ablekuma|tema/i.test(f.properties.shapeName))).toBe(
      false,
    );
  });

  it('retains geoBoundaries CC BY 4.0 attribution metadata', () => {
    const fc = loadAshanti();
    const source = JSON.parse(readFileSync(SOURCE_PATH, 'utf8')) as {
      boundaryLicense: string;
      boundaryID: string;
    };
    expect(fc.attribution.license).toMatch(/CC BY 4\.0|Creative Commons Attribution 4\.0/i);
    expect(source.boundaryLicense).toMatch(/CC BY 4\.0|Creative Commons Attribution 4\.0/i);
    expect(fc.attribution.dataset).toBe(source.boundaryID);
  });
});

describe('District-linked service zone lifecycle', () => {
  it('activates a verified district zone without a community link', async () => {
    const repo = new MemoryServiceZonesRepository();
    const audit = { record: async () => undefined };
    const service = new ServiceZonesServiceImpl(repo, { audit: audit as never });
    const district = repo.seedDistrict({ name: 'Atwima Kwanwoma', code: 'AKW' });
    const actorId = '00000000-0000-4000-8000-000000000001';

    const created = (await service.createZone(actorId, {
      name: 'Atwima Kwanwoma',
      slug: 'atwima-kwanwoma',
      districtId: district.id,
      boundary: squareAround(-1.6, 6.6),
      geographicSource: 'geoBoundaries gbOpen GHA-ADM2',
      geographicAttribution: 'CC BY 4.0',
    })) as { id: string; districtId: string | null; status: string };

    expect(created.districtId).toBe(district.id);
    expect(created.status).toBe('DRAFT');

    await service.submitReview(actorId, created.id);
    await service.verifyBoundary(actorId, created.id);
    const active = (await service.activateZone(actorId, created.id)) as {
      status: string;
      isActive: boolean;
    };
    expect(active.status).toBe('ACTIVE');
    expect(active.isActive).toBe(true);
  });

  it('rejects a second zone for the same district', async () => {
    const repo = new MemoryServiceZonesRepository();
    const audit = { record: async () => undefined };
    const service = new ServiceZonesServiceImpl(repo, { audit: audit as never });
    const district = repo.seedDistrict();
    const actorId = '00000000-0000-4000-8000-000000000002';

    await service.createZone(actorId, {
      name: 'District A',
      districtId: district.id,
      boundary: squareAround(-1.5, 6.5),
    });

    await expect(
      service.createZone(actorId, {
        name: 'District A duplicate',
        districtId: district.id,
        boundary: squareAround(-1.51, 6.51),
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('refuses activation when boundary is unverified', async () => {
    const repo = new MemoryServiceZonesRepository();
    const audit = { record: async () => undefined };
    const service = new ServiceZonesServiceImpl(repo, { audit: audit as never });
    const district = repo.seedDistrict();
    const actorId = '00000000-0000-4000-8000-000000000003';

    const created = (await service.createZone(actorId, {
      name: 'Draft District',
      districtId: district.id,
      boundary: squareAround(-1.55, 6.55),
    })) as { id: string };

    await service.submitReview(actorId, created.id);
    await expect(service.activateZone(actorId, created.id)).rejects.toMatchObject({
      code: 'CONFLICT',
    });
  });
});

function pointInRing(lng: number, lat: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i]![0]!;
    const yi = ring[i]![1]!;
    const xj = ring[j]![0]!;
    const yj = ring[j]![1]!;
    const intersect = yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function pointInBoundary(lng: number, lat: number, boundary: { type: string; coordinates: unknown }): boolean {
  const polys =
    boundary.type === 'Polygon'
      ? [boundary.coordinates as number[][][]]
      : (boundary.coordinates as number[][][][]);
  for (const poly of polys) {
    const [outer, ...holes] = poly;
    if (!outer || !pointInRing(lng, lat, outer)) continue;
    if (holes.some((h) => pointInRing(lng, lat, h))) continue;
    return true;
  }
  return false;
}

describe('Atwima Kwanwoma PIP fixture', () => {
  it('accepts an interior point and rejects a far Accra point against ADM2 geometry', () => {
    const fc = loadAshanti();
    const feature = fc.features.find((f) => f.properties.zoneSlug === 'atwima-kwanwoma');
    expect(feature).toBeTruthy();
    const { boundary } = validateAndNormalizeBoundary(feature!.geometry);

    // Open Admin catalogue centroid for Atwima Kwanwoma
    expect(pointInBoundary(-1.712, 6.59, boundary)).toBe(true);
    // Accra — must not be accepted as Atwima Kwanwoma coverage
    expect(pointInBoundary(-0.187, 5.6037, boundary)).toBe(false);
    // Misplaced Kokobin bbox centroid (~6.447, -1.365) is east of Atwima Kwanwoma
    expect(pointInBoundary(-1.365, 6.447, boundary)).toBe(false);
  });
});
