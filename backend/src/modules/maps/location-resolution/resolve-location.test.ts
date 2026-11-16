import { describe, expect, it } from 'vitest';

import { matchAshantiTown } from './catalogue-match.js';
import { findNearbyLandmarks } from './nearby-landmarks.js';
import { parseProviderLabel } from './provider-label.js';
import { resolveLocation } from './resolve-location.js';

describe('parseProviderLabel', () => {
  it('extracts hierarchy from a specific provider label', () => {
    const parsed = parseProviderLabel(
      'Adum, Kumasi, Ashanti Region, Ghana',
    );
    expect(parsed.locality).toBe('Adum');
    expect(parsed.city).toBe('Kumasi');
    expect(parsed.region).toBe('Ashanti Region');
    expect(parsed.country).toBe('Ghana');
    expect(parsed.isCoarse).toBe(false);
  });

  it('marks Kumasi + Ashanti as coarse', () => {
    const parsed = parseProviderLabel('Kumasi, Ashanti Region, Ghana');
    expect(parsed.city).toBe('Kumasi');
    expect(parsed.region).toBe('Ashanti Region');
    expect(parsed.locality).toBeNull();
    expect(parsed.isCoarse).toBe(true);
  });
});

describe('matchAshantiTown', () => {
  it('matches Ahenema Kokoben near its Open Admin centroid with confidence', () => {
    // Open Admin point: 6.626, -1.65
    const match = matchAshantiTown(6.6262, -1.6501);
    expect(match).not.toBeNull();
    expect(match!.town.sourceId).toBe('GH0218_ahenema-kokoben');
    expect(match!.distanceMeters).toBeLessThan(100);
    expect(['high', 'medium']).toContain(match!.confidence);
  });

  it('does not assert a town far from any centroid', () => {
    // Gulf of Guinea — outside dense Ashanti town spacing
    expect(matchAshantiTown(5.0, -1.0)).toBeNull();
  });
});

describe('resolveLocation', () => {
  it('upgrades a coarse Kumasi label near Ahenema using the catalogue', () => {
    const result = resolveLocation({
      latitude: 6.626,
      longitude: -1.65,
      providerLabel: 'Kumasi, Ashanti Region, Ghana',
    });

    expect(result.location.latitude).toBe(6.626);
    expect(result.location.longitude).toBe(-1.65);
    expect(result.location.locality).toMatch(/Ahenema/i);
    expect(result.location.district).toMatch(/Atwima Kwanwoma/i);
    expect(result.location.region).toBe('Ashanti Region');
    expect(result.location.country).toBe('Ghana');
    expect(result.location.formattedAddress).toMatch(/Ahenema/i);
    expect(result.location.formattedAddress).toMatch(/Atwima Kwanwoma/i);
    expect(result.location.source).toBe('provider+catalogue');
    expect(result.location.catalogueTownId).toContain('ahenema-kokoben');
  });

  it('does not replace a specific provider locality with the nearest town', () => {
    const result = resolveLocation({
      latitude: 6.626,
      longitude: -1.65,
      providerLabel: 'Bebu Junction, Atwima Kwanwoma District, Ashanti Region, Ghana',
    });

    expect(result.location.locality).toMatch(/Bebu/i);
    expect(result.location.locality).not.toMatch(/Ahenema/i);
    expect(result.location.latitude).toBe(6.626);
    expect(result.location.longitude).toBe(-1.65);
  });

  it('returns a partial approximate location when only coarse provider data exists', () => {
    // Middle of Lake Bosomtwe area but use a label-only coarse case far from unique town
    const result = resolveLocation({
      latitude: 6.74,
      longitude: -1.628,
      providerLabel: 'Kumasi, Ashanti Region, Ghana',
      landmarkLimit: 3,
    });

    expect(result.location.country).toBe('Ghana');
    expect(result.location.region).toBe('Ashanti Region');
    // Coordinates never move to a centroid substitute for the pin.
    expect(result.location.latitude).toBe(6.74);
    expect(result.location.longitude).toBe(-1.628);
    if (!result.location.locality) {
      expect(result.location.approximate).toBe(true);
      expect(result.location.formattedAddress).toMatch(/Ashanti/i);
    }
  });

  it('returns unavailable-style empty address when provider and catalogue miss', () => {
    const result = resolveLocation({
      latitude: 0.1,
      longitude: 0.1,
      providerLabel: null,
    });
    expect(result.location.formattedAddress).toBe('');
    expect(result.location.source).toBe('unavailable');
    expect(result.location.approximate).toBe(true);
    expect(result.location.latitude).toBe(0.1);
    expect(result.location.longitude).toBe(0.1);
    expect(result.nearbyLandmarks).toEqual([]);
  });

  it('lists nearby verified landmarks without inventing them', () => {
    const landmarks = findNearbyLandmarks({
      latitude: 6.695,
      longitude: -1.622,
      limit: 5,
    });
    expect(landmarks.length).toBeGreaterThan(0);
    expect(landmarks[0]!.name.length).toBeGreaterThan(0);
    expect(landmarks[0]!.distanceMeters).toBeGreaterThanOrEqual(0);
    expect(landmarks[0]!.source.length).toBeGreaterThan(0);
    for (const hit of landmarks) {
      expect(hit.latitude).toBeTypeOf('number');
      expect(hit.longitude).toBeTypeOf('number');
    }
  });
});
