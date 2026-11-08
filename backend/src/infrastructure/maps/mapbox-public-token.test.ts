import { describe, expect, it } from 'vitest';

import {
  acceptPublicMapboxToken,
  resolveMapboxPublicToken,
} from './mapbox-public-token.js';

describe('acceptPublicMapboxToken', () => {
  it('keeps pk tokens and drops secrets / junk', () => {
    expect(acceptPublicMapboxToken('pk.abc')).toBe('pk.abc');
    expect(acceptPublicMapboxToken('  pk.abc  ')).toBe('pk.abc');
    expect(acceptPublicMapboxToken('sk.secret')).toBe('');
    expect(acceptPublicMapboxToken('not-a-token')).toBe('');
    expect(acceptPublicMapboxToken('')).toBe('');
    expect(acceptPublicMapboxToken(null)).toBe('');
  });
});

describe('resolveMapboxPublicToken', () => {
  it('prefers MAPBOX_ACCESS_TOKEN over legacy MAPS_API_KEY', () => {
    expect(
      resolveMapboxPublicToken({
        MAPBOX_ACCESS_TOKEN: 'pk.primary',
        MAPS_API_KEY: 'pk.legacy',
      }),
    ).toBe('pk.primary');
  });

  it('uses legacy MAPS_API_KEY when it is a public token', () => {
    expect(
      resolveMapboxPublicToken({
        MAPBOX_ACCESS_TOKEN: '',
        MAPS_API_KEY: 'pk.legacy',
      }),
    ).toBe('pk.legacy');
  });

  it('ignores non-pk legacy MAPS_API_KEY', () => {
    expect(
      resolveMapboxPublicToken({
        MAPBOX_ACCESS_TOKEN: '',
        MAPS_API_KEY: 'cyrlo-maps-secret',
      }),
    ).toBe('');
  });
});
