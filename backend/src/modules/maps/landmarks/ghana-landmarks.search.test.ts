import { describe, expect, it } from 'vitest';

import type { PlaceHit } from '../../../infrastructure/maps/cyrlo-maps.client.js';
import {
  GHANA_LANDMARKS,
  isInsideGhana,
  type GhanaLandmark,
} from './ghana-landmarks.catalog.js';
import {
  filterProviderHitsToGhana,
  findDuplicateLandmarks,
  mergeLandmarkAndProviderHits,
  scoreLandmarkMatch,
  searchGhanaLandmarks,
} from './ghana-landmarks.search.js';

describe('Ghana bbox filter', () => {
  it('accepts Kumasi and Accra coordinates and rejects Côte d’Ivoire / Korea / Congo', () => {
    expect(isInsideGhana(6.6885, -1.6244)).toBe(true);
    expect(isInsideGhana(5.6037, -0.187)).toBe(true);
    // Abidjan
    expect(isInsideGhana(5.36, -4.0083)).toBe(false);
    // Seoul
    expect(isInsideGhana(37.5665, 126.978)).toBe(false);
    // Kinshasa
    expect(isInsideGhana(-4.4419, 15.2663)).toBe(false);
  });

  it('drops international provider hits', () => {
    const hits: PlaceHit[] = [
      {
        id: 'gh',
        label: 'Kejetia',
        address: 'Kumasi',
        latitude: 6.69,
        longitude: -1.62,
      },
      {
        id: 'ci',
        label: 'Abidjan',
        address: 'Côte d’Ivoire',
        latitude: 5.36,
        longitude: -4.0083,
      },
      {
        id: 'kr',
        label: 'Taepyeong',
        address: 'South Korea',
        latitude: 37.56,
        longitude: 126.98,
      },
    ];
    expect(filterProviderHitsToGhana(hits).map((h) => h.id)).toEqual(['gh']);
  });
});

describe('landmark matching and aliases', () => {
  it('matches official names and aliases', () => {
    const knust = GHANA_LANDMARKS.find((l) => l.id === 'gh-knust')!;
    expect(scoreLandmarkMatch('KNUST', knust)).toBeGreaterThanOrEqual(0.9);
    expect(scoreLandmarkMatch('knust', knust)).toBeGreaterThanOrEqual(0.9);
    expect(
      scoreLandmarkMatch('Kwame Nkrumah University of Science and Technology', knust),
    ).toBe(1);

    const kath = GHANA_LANDMARKS.find((l) => l.id === 'gh-kath')!;
    expect(scoreLandmarkMatch('KATH', kath)).toBeGreaterThanOrEqual(0.9);
    expect(scoreLandmarkMatch('Komfo Anokye', kath)).toBeGreaterThan(0.5);
  });

  it('returns curated hits for Kejetia and City Mall', () => {
    const kejetia = searchGhanaLandmarks({ query: 'Kejetia', limit: 5 });
    expect(kejetia.some((h) => h.label.includes('Kejetia'))).toBe(true);
    expect(kejetia.every((h) => isInsideGhana(h.latitude, h.longitude))).toBe(true);

    const mall = searchGhanaLandmarks({ query: 'Kumasi City Mall', limit: 5 });
    expect(mall[0]?.label).toContain('Kumasi City Mall');
  });

  it('biases proximity toward pickup near Tafo over distant Accra-like bias', () => {
    const tafoBias = { latitude: 6.74, longitude: -1.61 };
    const near = searchGhanaLandmarks({
      query: 'Tafo',
      limit: 3,
      bias: tafoBias,
    });
    expect(near[0]?.label).toBe('Tafo');
  });

  it('returns empty when nothing matches', () => {
    expect(
      searchGhanaLandmarks({ query: 'zzzznonexistentplacexyz', limit: 5 }),
    ).toEqual([]);
  });
});

describe('duplicate landmark handling', () => {
  it('reports no duplicates in the verified catalog', () => {
    expect(findDuplicateLandmarks()).toEqual([]);
  });

  it('detects same-name near-duplicates in a synthetic catalog', () => {
    const base = GHANA_LANDMARKS[0]!;
    const catalog: GhanaLandmark[] = [
      base,
      {
        ...base,
        id: 'gh-knust-dup',
        latitude: base.latitude + 0.0001,
        longitude: base.longitude + 0.0001,
      },
    ];
    const dupes = findDuplicateLandmarks(catalog);
    expect(dupes).toHaveLength(1);
    expect(dupes[0]?.a).toBe(base.id);
    expect(dupes[0]?.b).toBe('gh-knust-dup');
  });

  it('merges landmarks ahead of provider and drops near-duplicates', () => {
    const landmark: PlaceHit = {
      id: 'landmark:gh-kejetia-market',
      label: 'Kejetia Market',
      address: 'Adum, Ashanti, Ghana',
      latitude: 6.6958325,
      longitude: -1.6210457,
    };
    const provider: PlaceHit[] = [
      {
        id: 'provider-near',
        label: 'Kejetia Market',
        address: 'Kumasi',
        latitude: 6.6959,
        longitude: -1.6211,
      },
      {
        id: 'provider-other',
        label: 'Adum',
        address: 'Kumasi',
        latitude: 6.6943,
        longitude: -1.6233,
      },
    ];
    const merged = mergeLandmarkAndProviderHits({
      landmarks: [landmark],
      provider,
      limit: 5,
    });
    expect(merged[0]?.id).toBe(landmark.id);
    expect(merged.some((h) => h.id === 'provider-near')).toBe(false);
    expect(merged.some((h) => h.id === 'provider-other')).toBe(true);
  });
});
