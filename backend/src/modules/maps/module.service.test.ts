import { describe, expect, it, vi } from 'vitest';

import type { CyrloMapsClient, PlaceHit } from '../../infrastructure/maps/cyrlo-maps.client.js';
import { MapsService } from './module.service.js';
import { PASSENGER_DESTINATION_COUNTRY } from './module.schema.js';

function stubClient(overrides: Partial<CyrloMapsClient> = {}): CyrloMapsClient {
  return {
    getConfig: vi.fn(async () => ({ ok: true })),
    geocode: vi.fn(async () => []),
    reverseGeocode: vi.fn(async () => null),
    searchPlaces: vi.fn(async () => []),
    route: vi.fn(async () => ({
      distanceMeters: 100,
      durationSeconds: 60,
      geometry: [],
    })),
    estimate: vi.fn(async () => ({ distanceMeters: 100, durationSeconds: 60 })),
    ...overrides,
  };
}

describe('MapsService passenger destination search', () => {
  it('requests Ghana country filter, types, and pickup bias from the provider', async () => {
    const searchPlaces = vi.fn(async () => [] as PlaceHit[]);
    const service = new MapsService(stubClient({ searchPlaces }));

    await service.places({
      text: 'Kejetia',
      limit: 5,
      bias: { latitude: 6.74, longitude: -1.61 },
    });

    expect(searchPlaces).toHaveBeenCalledWith(
      expect.objectContaining({
        text: 'Kejetia',
        country: PASSENGER_DESTINATION_COUNTRY,
        bias: { latitude: 6.74, longitude: -1.61 },
        types: expect.arrayContaining(['poi', 'address', 'locality', 'street']),
      }),
    );
  });

  it('excludes international provider results even if the upstream returns them', async () => {
    const searchPlaces = vi.fn(async () => [
      {
        id: 'ci',
        label: 'Abidjan',
        address: 'Côte d’Ivoire',
        latitude: 5.36,
        longitude: -4.0083,
      },
      {
        id: 'kr',
        label: 'Seoul',
        address: 'South Korea',
        latitude: 37.56,
        longitude: 126.98,
      },
    ] satisfies PlaceHit[]);
    const service = new MapsService(stubClient({ searchPlaces }));

    const { results } = await service.places({ text: 'market', limit: 8 });
    expect(results.every((r) => r.id.startsWith('landmark:') || r.latitude > 4)).toBe(
      true,
    );
    expect(results.some((r) => r.label === 'Abidjan')).toBe(false);
    expect(results.some((r) => r.label === 'Seoul')).toBe(false);
  });

  it('surfaces curated Ghana landmarks ahead of provider POIs', async () => {
    const searchPlaces = vi.fn(async () => [
      {
        id: 'provider-1',
        label: 'Some street',
        address: 'Kumasi',
        latitude: 6.7,
        longitude: -1.62,
      },
    ] satisfies PlaceHit[]);
    const service = new MapsService(stubClient({ searchPlaces }));

    const { results } = await service.places({ text: 'KNUST', limit: 5 });
    expect(results[0]?.id).toBe('landmark:gh-knust');
    expect(results[0]?.label).toContain('Kwame Nkrumah');
    expect(results[0]?.address).toContain('Ashanti');
  });

  it('returns empty results without inventing hits', async () => {
    const service = new MapsService(stubClient());
    await expect(
      service.places({ text: 'zzzznonexistentplacexyz123', limit: 5 }),
    ).resolves.toEqual({ results: [] });
  });

  it('still returns landmarks when the provider fails', async () => {
    const searchPlaces = vi.fn(async () => {
      throw new Error('provider down');
    });
    const service = new MapsService(stubClient({ searchPlaces }));
    const { results } = await service.places({ text: 'Kejetia', limit: 3 });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]?.label).toContain('Kejetia');
  });

  it('leaves reverse geocode and routes unfiltered by destination search rules', async () => {
    const reverseGeocode = vi.fn(async () => ({
      label: 'Pinned',
      latitude: 6.7,
      longitude: -1.62,
    }));
    const route = vi.fn(async () => ({
      distanceMeters: 900,
      durationSeconds: 200,
      geometry: [
        { latitude: 6.7, longitude: -1.62 },
        { latitude: 6.71, longitude: -1.61 },
      ],
    }));
    const service = new MapsService(stubClient({ reverseGeocode, route }));

    await expect(
      service.reverse({ latitude: 6.7, longitude: -1.62 }),
    ).resolves.toEqual({
      result: { label: 'Pinned', latitude: 6.7, longitude: -1.62 },
    });
    await expect(
      service.route({
        from: { latitude: 6.7, longitude: -1.62 },
        to: { latitude: 6.71, longitude: -1.61 },
      }),
    ).resolves.toMatchObject({ distanceMeters: 900 });
    expect(reverseGeocode).toHaveBeenCalledOnce();
    expect(route).toHaveBeenCalledOnce();
  });
});
