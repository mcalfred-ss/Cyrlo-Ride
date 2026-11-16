/**
 * Seed all 43 Ashanti Region district service zones from verified geoBoundaries ADM2.
 *
 * Local / test only. Does NOT activate production Kokobin cutover.
 *
 * Initial policy:
 *   - Atwima Kwanwoma → ACTIVE + VERIFIED (only active district zone)
 *   - Every other Ashanti district → DRAFT + VERIFIED (inactive / not bookable)
 *   - Does not create a Kokobin community zone as the Atwima boundary
 *
 * Usage:
 *   npx tsx scripts/seed-ashanti-district-zones.ts
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { PrismaClient, type DistrictAdminType } from '@prisma/client';

import { validateAndNormalizeBoundary } from '../src/modules/service-zones/zone-geometry.js';

const prisma = new PrismaClient();

const GEOJSON_PATH = resolve(
  process.cwd(),
  '../ops/geo/ashanti/ashanti-districts-adm2.geojson',
);

const ACTIVE_SLUG = 'atwima-kwanwoma';

type FeatureProps = {
  catalogueId: string;
  catalogueName: string;
  catalogueSourceId?: string;
  category?: string;
  shapeName: string;
  shapeID: string;
  zoneSlug: string;
  zoneName: string;
  geometryVariant?: string;
  vertexCount?: number;
};

type FeatureCollection = {
  type: 'FeatureCollection';
  attribution?: {
    license?: string;
    source?: string;
    dataset?: string;
    yearRepresented?: string;
    buildDate?: string;
    releaseCommit?: string;
  };
  features: Array<{
    type: 'Feature';
    properties: FeatureProps;
    geometry: unknown;
  }>;
};

function districtCode(catalogueId: string, sourceId?: string): string {
  if (catalogueId === 'gh-dist-atwima-kwanwoma') return 'AKW';
  if (sourceId && /^GH\d+$/i.test(sourceId)) return sourceId.toUpperCase();
  return catalogueId.replace(/^gh-dist-/, '').slice(0, 24).toUpperCase();
}

function adminType(category?: string): DistrictAdminType {
  const key = (category || '').toLowerCase();
  if (key.includes('metro')) return 'METROPOLITAN';
  if (key.includes('municipal')) return 'MUNICIPAL';
  return 'DISTRICT';
}

async function main() {
  const raw = JSON.parse(readFileSync(GEOJSON_PATH, 'utf8')) as FeatureCollection;
  if (!raw.features || raw.features.length !== 43) {
    throw new Error(`Expected 43 Ashanti district features, got ${raw.features?.length}`);
  }

  const attribution = raw.attribution ?? {};
  const geographicSource = `geoBoundaries gbOpen ${attribution.dataset ?? 'GHA-ADM2'} (${attribution.yearRepresented ?? '2019'})`;
  const geographicAttribution = `${attribution.source ?? 'USAID Ghana HPNO, Ghana Statistical Service'}; ${attribution.license ?? 'CC BY 4.0'}`;
  const geographicDatasetVersion = `${attribution.releaseCommit ?? '9469f09'}:${attribution.buildDate ?? 'Dec 12, 2023'}`;

  const country = await prisma.country.upsert({
    where: { isoCode: 'GH' },
    create: { name: 'Ghana', isoCode: 'GH', status: 'ACTIVE' },
    update: { name: 'Ghana', status: 'ACTIVE' },
  });

  const region = await prisma.region.upsert({
    where: { countryId_code: { countryId: country.id, code: 'ASH' } },
    create: {
      countryId: country.id,
      name: 'Ashanti Region',
      code: 'ASH',
      status: 'ACTIVE',
    },
    update: { name: 'Ashanti Region', status: 'ACTIVE' },
  });

  const summary: Array<{
    name: string;
    slug: string;
    districtId: string;
    zoneId: string;
    status: string;
    isActive: boolean;
  }> = [];

  for (const feature of raw.features) {
    const props = feature.properties;
    const { boundary, boundingBox } = validateAndNormalizeBoundary(feature.geometry);
    const code = districtCode(props.catalogueId, props.catalogueSourceId);
    const isAtwima = props.zoneSlug === ACTIVE_SLUG;

    const district = await prisma.district.upsert({
      where: { regionId_code: { regionId: region.id, code } },
      create: {
        regionId: region.id,
        name: props.catalogueName,
        code,
        adminType: adminType(props.category),
        status: 'ACTIVE',
        catalogueId: props.catalogueId,
      },
      update: {
        name: props.catalogueName,
        adminType: adminType(props.category),
        status: 'ACTIVE',
        catalogueId: props.catalogueId,
      },
    });

    const existing = await prisma.serviceZone.findUnique({
      where: { districtId: district.id },
    });

    const zoneData = {
      name: props.zoneName,
      slug: props.zoneSlug,
      description: `Ashanti district service zone for ${props.catalogueName}. Boundary from geoBoundaries ADM2 (${props.shapeName}).`,
      communityId: null as string | null,
      districtId: district.id,
      boundary,
      minLatitude: boundingBox.minLatitude,
      maxLatitude: boundingBox.maxLatitude,
      minLongitude: boundingBox.minLongitude,
      maxLongitude: boundingBox.maxLongitude,
      geographicSource,
      geographicAttribution,
      geographicDatasetVersion,
      geographicShapeId: props.shapeID,
      boundaryVerificationStatus: 'VERIFIED' as const,
      status: isAtwima ? ('ACTIVE' as const) : ('DRAFT' as const),
      isActive: isAtwima,
      activatedAt: isAtwima ? new Date() : null,
      activatedById: null,
      suspendedAt: null,
      suspendedById: null,
    };

    const zone = existing
      ? await prisma.serviceZone.update({ where: { id: existing.id }, data: zoneData })
      : await prisma.serviceZone.create({ data: zoneData });

    summary.push({
      name: zone.name,
      slug: zone.slug ?? props.zoneSlug,
      districtId: district.id,
      zoneId: zone.id,
      status: zone.status,
      isActive: zone.isActive,
    });
  }

  const active = summary.filter((z) => z.isActive);
  if (active.length !== 1 || active[0]?.slug !== ACTIVE_SLUG) {
    throw new Error(
      `Invariant failed: expected only ${ACTIVE_SLUG} ACTIVE, got ${JSON.stringify(active)}`,
    );
  }

  console.log(
    JSON.stringify(
      {
        regionId: region.id,
        districtZones: summary.length,
        activeZone: active[0],
        inactiveCount: summary.length - 1,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
