/**
 * Load the sourced Kokobin pilot polygon into the configured database.
 * Creates inactive by default unless LOAD_ZONE_ACTIVATE=1.
 *
 * Usage (from backend/, env already loaded):
 *   npx tsx scripts/load-kokobin-zone.ts
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { PrismaClient } from '@prisma/client';

import { validateAndNormalizeBoundary } from '../src/modules/service-zones/zone-geometry.js';

const ZONE_NAME = 'Kokobin';
const geoPath = resolve(process.cwd(), '../ops/zones/kokobin.geojson');

async function main() {
  const raw = JSON.parse(readFileSync(geoPath, 'utf8')) as {
    geometry?: unknown;
    type?: string;
  };
  const geometry = raw.type === 'Feature' ? raw.geometry : raw;
  const { boundary, boundingBox } = validateAndNormalizeBoundary(geometry);
  const activate = process.env.LOAD_ZONE_ACTIVATE === '1';

  const prisma = new PrismaClient();
  try {
    const existing = await prisma.serviceZone.findFirst({
      where: { name: { equals: ZONE_NAME, mode: 'insensitive' } },
    });

    if (existing) {
      const updated = await prisma.serviceZone.update({
        where: { id: existing.id },
        data: {
          name: ZONE_NAME,
          description: 'First pilot activation zone (sourced GeoJSON).',
          boundary,
          minLatitude: boundingBox.minLatitude,
          maxLatitude: boundingBox.maxLatitude,
          minLongitude: boundingBox.minLongitude,
          maxLongitude: boundingBox.maxLongitude,
          ...(activate ? { isActive: true } : {}),
        },
      });
      console.log(
        JSON.stringify({
          action: 'updated',
          id: updated.id,
          name: updated.name,
          isActive: updated.isActive,
          bbox: boundingBox,
        }),
      );
      return;
    }

    const created = await prisma.serviceZone.create({
      data: {
        name: ZONE_NAME,
        description: 'First pilot activation zone (sourced GeoJSON).',
        boundary,
        minLatitude: boundingBox.minLatitude,
        maxLatitude: boundingBox.maxLatitude,
        minLongitude: boundingBox.minLongitude,
        maxLongitude: boundingBox.maxLongitude,
        isActive: activate,
      },
    });
    console.log(
      JSON.stringify({
        action: 'created',
        id: created.id,
        name: created.name,
        isActive: created.isActive,
        bbox: boundingBox,
      }),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
