import { describe, expect, it } from 'vitest';

import {
  approximateCoordinate,
  etaMinutesFromDistance,
  publicRiderDisplayName,
} from './approximate-location.js';

describe('approximateCoordinate', () => {
  it('snaps nearby points into the same cell and differs across cells', () => {
    const a = approximateCoordinate(6.6885, -1.6244);
    const b = approximateCoordinate(6.6886, -1.6245);
    const far = approximateCoordinate(6.7, -1.6244);
    expect(a).toEqual(b);
    expect(far.latitude).not.toBe(a.latitude);
  });

  it('does not invent NaN coordinates', () => {
    const point = approximateCoordinate(5.6, -0.2);
    expect(Number.isFinite(point.latitude)).toBe(true);
    expect(Number.isFinite(point.longitude)).toBe(true);
  });
});

describe('publicRiderDisplayName', () => {
  it('uses first name only and falls back to vehicle label', () => {
    expect(publicRiderDisplayName('Kwame Boateng', 'PRAGYA')).toBe('Kwame');
    expect(publicRiderDisplayName('  ', 'OKADA')).toBe('Okada rider');
    expect(publicRiderDisplayName(null, 'PRAGYA')).toBe('Pragya rider');
  });
});

describe('etaMinutesFromDistance', () => {
  it('bands distance into at least one minute', () => {
    expect(etaMinutesFromDistance(50)).toBe(1);
    expect(etaMinutesFromDistance(5_000)).toBeGreaterThan(1);
  });
});
