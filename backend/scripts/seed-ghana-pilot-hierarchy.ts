/**
 * Seed supported Ghana pilot hierarchy (no invented community polygons).
 * Links/creates Kokobin service zone as LOCKED with sourced boundary — never ACTIVE.
 *
 *   npx tsx scripts/seed-ghana-pilot-hierarchy.ts
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { PrismaClient } from '@prisma/client';

import { validateAndNormalizeBoundary } from '../src/modules/service-zones/zone-geometry.js';

const prisma = new PrismaClient();
const geoPath = resolve(process.cwd(), '../ops/zones/kokobin.geojson');

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

async function main() {
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

  const district = await prisma.district.upsert({
    where: { regionId_code: { regionId: region.id, code: 'AKW' } },
    create: {
      regionId: region.id,
      name: 'Atwima Kwanwoma District',
      code: 'AKW',
      adminType: 'DISTRICT',
      status: 'ACTIVE',
    },
    update: {
      name: 'Atwima Kwanwoma District',
      adminType: 'DISTRICT',
      status: 'ACTIVE',
    },
  });

  const communitySlug = slugify('Ahenema Kokoben');
  const community = await prisma.community.upsert({
    where: { districtId_slug: { districtId: district.id, slug: communitySlug } },
    create: {
      districtId: district.id,
      name: 'Ahenema Kokoben',
      slug: communitySlug,
      // Center/boundary left null until field-verified — do not invent.
      verificationStatus: 'UNVERIFIED',
      status: 'ACTIVE',
    },
    update: {
      name: 'Ahenema Kokoben',
      status: 'ACTIVE',
    },
  });

  const raw = JSON.parse(readFileSync(geoPath, 'utf8')) as {
    geometry?: unknown;
    type?: string;
  };
  const geometry = raw.type === 'Feature' ? raw.geometry : raw;
  const { boundary, boundingBox } = validateAndNormalizeBoundary(geometry);

  const existing = await prisma.serviceZone.findFirst({
    where: { name: { equals: 'Kokobin', mode: 'insensitive' } },
  });

  const zoneData = {
    name: 'Kokobin',
    slug: 'kokobin',
    description: 'Central Ahenema Kokoben pilot polygon (sourced GeoJSON). Locked until Ops activation.',
    communityId: community.id,
    boundary,
    minLatitude: boundingBox.minLatitude,
    maxLatitude: boundingBox.maxLatitude,
    minLongitude: boundingBox.minLongitude,
    maxLongitude: boundingBox.maxLongitude,
    // Sourced geometry may be marked verified; zone stays non-bookable.
    boundaryVerificationStatus: 'VERIFIED' as const,
    status: 'LOCKED' as const,
    isActive: false,
    activatedAt: null,
    activatedById: null,
    suspendedAt: null,
    suspendedById: null,
  };

  const zone = existing
    ? await prisma.serviceZone.update({
        where: { id: existing.id },
        data: zoneData,
      })
    : await prisma.serviceZone.create({ data: zoneData });

  console.log(
    JSON.stringify(
      {
        countryId: country.id,
        regionId: region.id,
        districtId: district.id,
        communityId: community.id,
        communityVerification: community.verificationStatus,
        zoneId: zone.id,
        zoneStatus: zone.status,
        zoneActive: zone.isActive,
        note: 'Surrounding communities not seeded — import only after separate verification.',
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
