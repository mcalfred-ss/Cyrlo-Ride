import type { PlaceHit } from '../../../infrastructure/maps/cyrlo-maps.client.js';
import {
  GHANA_LANDMARKS,
  type GhanaLandmark,
  isInsideGhana,
} from './ghana-landmarks.catalog.js';

const DUPLICATE_METERS = 80;

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function haversineMeters(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number,
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function locationContext(landmark: GhanaLandmark): string {
  if (landmark.community && landmark.region) {
    return `${landmark.community}, ${landmark.region}, Ghana`;
  }
  return [landmark.community, landmark.district, landmark.region, 'Ghana']
    .filter(Boolean)
    .join(', ');
}

export function landmarkToPlaceHit(landmark: GhanaLandmark): PlaceHit {
  return {
    id: `landmark:${landmark.id}`,
    label: landmark.name,
    address: locationContext(landmark),
    latitude: landmark.latitude,
    longitude: landmark.longitude,
  };
}

/** Score 0–1; higher is better. */
export function scoreLandmarkMatch(
  query: string,
  landmark: GhanaLandmark,
): number {
  const q = normalize(query);
  if (!q) return 0;

  const names = [landmark.name, ...landmark.aliases].map(normalize);
  let best = 0;
  for (const name of names) {
    if (!name) continue;
    if (name === q) {
      best = Math.max(best, 1);
      continue;
    }
    if (name.startsWith(q) || q.startsWith(name)) {
      best = Math.max(best, 0.92);
      continue;
    }
    if (name.includes(q) || q.includes(name)) {
      best = Math.max(best, 0.82);
      continue;
    }
    const qTokens = q.split(' ').filter(Boolean);
    const nTokens = new Set(name.split(' ').filter(Boolean));
    if (qTokens.length === 0) continue;
    const hits = qTokens.filter((t) => nTokens.has(t)).length;
    const ratio = hits / qTokens.length;
    if (ratio >= 0.6) {
      best = Math.max(best, 0.55 + ratio * 0.3);
    }
  }
  return best;
}

export function findDuplicateLandmarks(
  catalog: readonly GhanaLandmark[] = GHANA_LANDMARKS,
  meters = DUPLICATE_METERS,
): Array<{ a: string; b: string; distanceMeters: number }> {
  const dupes: Array<{ a: string; b: string; distanceMeters: number }> = [];
  for (let i = 0; i < catalog.length; i++) {
    for (let j = i + 1; j < catalog.length; j++) {
      const a = catalog[i]!;
      const b = catalog[j]!;
      const distance = haversineMeters(
        a.latitude,
        a.longitude,
        b.latitude,
        b.longitude,
      );
      const aNames = new Set([normalize(a.name), ...a.aliases.map(normalize)]);
      const bNames = [normalize(b.name), ...b.aliases.map(normalize)];
      const sameName = bNames.some((name) => aNames.has(name));
      if (sameName && distance <= meters) {
        dupes.push({ a: a.id, b: b.id, distanceMeters: distance });
      }
    }
  }
  return dupes;
}

export function searchGhanaLandmarks(params: {
  query: string;
  limit: number;
  bias?: { latitude: number; longitude: number } | null;
  catalog?: readonly GhanaLandmark[];
}): PlaceHit[] {
  const catalog = params.catalog ?? GHANA_LANDMARKS;
  return catalog
    .map((landmark) => {
      const score = scoreLandmarkMatch(params.query, landmark);
      if (score < 0.55) return null;
      let proximityBoost = 0;
      if (params.bias) {
        const meters = haversineMeters(
          params.bias.latitude,
          params.bias.longitude,
          landmark.latitude,
          landmark.longitude,
        );
        if (meters < 40_000) {
          proximityBoost = (1 - meters / 40_000) * 0.12;
        }
      }
      return { landmark, score: score + proximityBoost };
    })
    .filter((row): row is { landmark: GhanaLandmark; score: number } =>
      Boolean(row),
    )
    .sort((a, b) => b.score - a.score)
    .slice(0, params.limit)
    .map((row) => landmarkToPlaceHit(row.landmark));
}

export function filterProviderHitsToGhana(hits: PlaceHit[]): PlaceHit[] {
  return hits.filter((hit) => isInsideGhana(hit.latitude, hit.longitude));
}

/**
 * Merge curated landmarks ahead of provider hits; drop near-duplicates of a
 * landmark already shown (same coords ~80m, or same name within 500m).
 */
export function mergeLandmarkAndProviderHits(params: {
  landmarks: PlaceHit[];
  provider: PlaceHit[];
  limit: number;
}): PlaceHit[] {
  const out: PlaceHit[] = [];
  const seenIds = new Set<string>();

  const isNearDuplicate = (candidate: PlaceHit): boolean => {
    return out.some((existing) => {
      const meters = haversineMeters(
        existing.latitude,
        existing.longitude,
        candidate.latitude,
        candidate.longitude,
      );
      if (meters <= DUPLICATE_METERS) return true;
      const a = normalize(existing.label);
      const b = normalize(candidate.label);
      return a === b && meters <= 500;
    });
  };

  for (const hit of params.landmarks) {
    if (seenIds.has(hit.id) || isNearDuplicate(hit)) continue;
    seenIds.add(hit.id);
    out.push(hit);
    if (out.length >= params.limit) return out;
  }

  for (const hit of params.provider) {
    if (seenIds.has(hit.id) || isNearDuplicate(hit)) continue;
    seenIds.add(hit.id);
    out.push(hit);
    if (out.length >= params.limit) break;
  }

  return out;
}
