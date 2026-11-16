import { ASHANTI_CATALOGUE_LANDMARKS } from '../catalogue/ashanti-open-admin.catalog.js';
import {
  GHANA_LANDMARKS,
  type GhanaLandmark,
} from '../landmarks/ghana-landmarks.catalog.js';
import { haversineMeters } from './geo-distance.js';
import type { ResolvedNearbyLandmark } from './types.js';

export const NEARBY_LANDMARK_DEFAULTS = {
  maxDistanceMeters: 8_000,
  limit: 5,
} as const;

/** Prefer useful rider/passenger references over generic community labels. */
const CATEGORY_WEIGHT: Record<string, number> = {
  hospital: 100,
  clinic: 95,
  university: 90,
  school: 85,
  market: 80,
  mall: 75,
  shopping: 75,
  junction: 70,
  roundabout: 70,
  station: 70,
  transport: 70,
  airport: 70,
  landmark: 60,
  community: 30,
  other: 20,
};

interface CandidateLandmark {
  id: string;
  name: string;
  category: string;
  latitude: number;
  longitude: number;
  source: string;
}

function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function fromVerifiedCatalog(landmark: GhanaLandmark): CandidateLandmark {
  return {
    id: landmark.id,
    name: landmark.name,
    category: landmark.category,
    latitude: landmark.latitude,
    longitude: landmark.longitude,
    source: `verified-catalog:${landmark.source}`,
  };
}

function fromOpenAdminLandmark(row: {
  id: string;
  name: string;
  category: string;
  latitude: number;
  longitude: number;
}): CandidateLandmark {
  return {
    id: row.id,
    name: row.name,
    category: row.category || 'landmark',
    latitude: row.latitude,
    longitude: row.longitude,
    source: 'open-admin-data:ashanti-landmarks',
  };
}

function scoreCandidate(category: string, distanceMeters: number): number {
  const weight = CATEGORY_WEIGHT[category.toLowerCase()] ?? CATEGORY_WEIGHT.other!;
  const proximity = Math.max(0, 1 - distanceMeters / NEARBY_LANDMARK_DEFAULTS.maxDistanceMeters);
  return weight + proximity * 40;
}

/**
 * Nearby verified landmarks / Open Admin Ashanti landmarks.
 * Does not invent POIs. Ranks by category relevance then proximity.
 */
export function findNearbyLandmarks(params: {
  latitude: number;
  longitude: number;
  limit?: number;
  maxDistanceMeters?: number;
  verified?: readonly GhanaLandmark[];
}): ResolvedNearbyLandmark[] {
  const limit = params.limit ?? NEARBY_LANDMARK_DEFAULTS.limit;
  const maxDistance =
    params.maxDistanceMeters ?? NEARBY_LANDMARK_DEFAULTS.maxDistanceMeters;
  const verified = params.verified ?? GHANA_LANDMARKS;

  const candidates: CandidateLandmark[] = [
    ...verified.map(fromVerifiedCatalog),
    ...ASHANTI_CATALOGUE_LANDMARKS.map(fromOpenAdminLandmark),
  ];

  const ranked: Array<ResolvedNearbyLandmark & { score: number; id: string }> = [];
  const seenNames = new Set<string>();

  for (const candidate of candidates) {
    const distanceMeters = haversineMeters(
      params.latitude,
      params.longitude,
      candidate.latitude,
      candidate.longitude,
    );
    if (distanceMeters > maxDistance) continue;

    const nameKey = normalizeName(candidate.name);
    if (seenNames.has(nameKey)) continue;

    // Drop near-duplicate names already accepted within 120 m.
    const nearDupe = ranked.some((existing) => {
      const sameName = normalizeName(existing.name) === nameKey;
      if (!sameName) return false;
      return (
        haversineMeters(
          existing.latitude,
          existing.longitude,
          candidate.latitude,
          candidate.longitude,
        ) <= 120
      );
    });
    if (nearDupe) continue;

    seenNames.add(nameKey);
    ranked.push({
      id: candidate.id,
      name: candidate.name,
      category: candidate.category,
      latitude: candidate.latitude,
      longitude: candidate.longitude,
      distanceMeters: Math.round(distanceMeters),
      source: candidate.source,
      score: scoreCandidate(candidate.category, distanceMeters),
    });
  }

  return ranked
    .sort((a, b) => b.score - a.score || a.distanceMeters - b.distanceMeters)
    .slice(0, limit)
    .map(({ name, category, latitude, longitude, distanceMeters, source }) => ({
      name,
      category,
      latitude,
      longitude,
      distanceMeters,
      source,
    }));
}
