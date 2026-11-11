import { afterEach, describe, expect, it, vi } from 'vitest';

import { AppError } from '../../common/errors/app-error.js';
import { HttpCyrloMapsClient, createCyrloMapsClient } from './cyrlo-maps.client.js';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('createCyrloMapsClient', () => {
  it('returns null when base URL or API key is missing', () => {
    expect(createCyrloMapsClient({ baseUrl: '', apiKey: 'secret' })).toBeNull();
    expect(createCyrloMapsClient({ baseUrl: 'https://maps.example', apiKey: '' })).toBeNull();
  });

  it('creates a client when both are present', () => {
    expect(
      createCyrloMapsClient({ baseUrl: 'https://maps.example', apiKey: 'secret-value-16chars' }),
    ).toBeInstanceOf(HttpCyrloMapsClient);
  });
});

describe('HttpCyrloMapsClient', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends Authorization Bearer and maps geocode results', async () => {
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe('https://maps.example/v1/geocode');
      expect(init?.method).toBe('POST');
      expect(init?.headers).toMatchObject({
        Authorization: 'Bearer test-secret-key-value',
      });
      const body = JSON.parse(String(init?.body));
      expect(body.query).toBe('Kumasi');
      return jsonResponse(200, {
        request_id: 'r1',
        data: {
          results: [{ label: 'Kumasi', latitude: 6.6885, longitude: -1.6244 }],
        },
      });
    });

    const client = new HttpCyrloMapsClient({
      baseUrl: 'https://maps.example/',
      apiKey: 'test-secret-key-value',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const results = await client.geocode({ query: 'Kumasi' });
    expect(results).toEqual([{ label: 'Kumasi', latitude: 6.6885, longitude: -1.6244 }]);
  });

  it('returns empty geocode results without inventing hits', async () => {
    const client = new HttpCyrloMapsClient({
      baseUrl: 'https://maps.example',
      apiKey: 'test-secret-key-value',
      fetchImpl: (async () =>
        jsonResponse(200, { request_id: 'r1', data: { results: [] } })) as unknown as typeof fetch,
    });
    await expect(client.geocode({ query: 'nowhere' })).resolves.toEqual([]);
  });

  it('returns null reverse result when provider has none', async () => {
    const client = new HttpCyrloMapsClient({
      baseUrl: 'https://maps.example',
      apiKey: 'test-secret-key-value',
      fetchImpl: (async () =>
        jsonResponse(200, { request_id: 'r1', data: { result: null } })) as unknown as typeof fetch,
    });
    await expect(client.reverseGeocode({ latitude: 6.7, longitude: -1.6 })).resolves.toBeNull();
  });

  it('maps place search and route estimate fields', async () => {
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/v1/places/search')) {
        const body = JSON.parse(String(init?.body));
        expect(body.country).toBe('GH');
        expect(body.types).toEqual(
          expect.arrayContaining(['poi', 'address', 'locality']),
        );
        expect(body.bias).toEqual({ latitude: 6.74, longitude: -1.61 });
        return jsonResponse(200, {
          request_id: 'r1',
          data: {
            results: [
              {
                id: 'p1',
                label: 'Kejetia',
                address: 'Kumasi',
                latitude: 6.7,
                longitude: -1.62,
              },
            ],
          },
        });
      }
      return jsonResponse(200, {
        request_id: 'r2',
        data: { distance_meters: 1200, duration_seconds: 180 },
      });
    });

    const client = new HttpCyrloMapsClient({
      baseUrl: 'https://maps.example',
      apiKey: 'test-secret-key-value',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await expect(
      client.searchPlaces({
        text: 'Kejetia',
        country: 'GH',
        types: ['poi', 'address', 'locality'],
        bias: { latitude: 6.74, longitude: -1.61 },
      }),
    ).resolves.toEqual([
      {
        id: 'p1',
        label: 'Kejetia',
        address: 'Kumasi',
        latitude: 6.7,
        longitude: -1.62,
      },
    ]);
    await expect(
      client.estimate({
        from: { latitude: 6.7, longitude: -1.62 },
        to: { latitude: 6.69, longitude: -1.61 },
      }),
    ).resolves.toEqual({ distanceMeters: 1200, durationSeconds: 180 });
  });

  it('maps route geometry', async () => {
    const client = new HttpCyrloMapsClient({
      baseUrl: 'https://maps.example',
      apiKey: 'test-secret-key-value',
      fetchImpl: (async () =>
        jsonResponse(200, {
          request_id: 'r1',
          data: {
            distance_meters: 500,
            duration_seconds: 90,
            geometry: [
              { latitude: 6.7, longitude: -1.62 },
              { latitude: 6.71, longitude: -1.61 },
            ],
          },
        })) as unknown as typeof fetch,
    });
    const route = await client.route({
      from: { latitude: 6.7, longitude: -1.62 },
      to: { latitude: 6.71, longitude: -1.61 },
    });
    expect(route.geometry).toHaveLength(2);
  });

  it('maps 401 without leaking the key', async () => {
    const client = new HttpCyrloMapsClient({
      baseUrl: 'https://maps.example',
      apiKey: 'super-secret-should-not-leak',
      fetchImpl: (async () =>
        jsonResponse(401, {
          error: { code: 'unauthorized', message: 'API key is missing or not valid.' },
          request_id: 'r1',
        })) as unknown as typeof fetch,
    });
    await expect(client.getConfig()).rejects.toMatchObject({
      status: 502,
      code: 'provider_unauthorized',
    });
  });

  it('maps 429 rate limits', async () => {
    const client = new HttpCyrloMapsClient({
      baseUrl: 'https://maps.example',
      apiKey: 'test-secret-key-value',
      fetchImpl: (async () =>
        jsonResponse(429, {
          error: { code: 'rate_limited', message: 'Too many requests' },
          request_id: 'r1',
        })) as unknown as typeof fetch,
    });
    await expect(client.getConfig()).rejects.toMatchObject({
      status: 429,
      code: 'RATE_LIMITED',
    });
  });

  it('maps invalid coordinates as validation errors', async () => {
    const client = new HttpCyrloMapsClient({
      baseUrl: 'https://maps.example',
      apiKey: 'test-secret-key-value',
      fetchImpl: (async () =>
        jsonResponse(400, {
          error: { code: 'invalid', message: 'latitude out of range' },
          request_id: 'r1',
        })) as unknown as typeof fetch,
    });
    await expect(client.reverseGeocode({ latitude: 999, longitude: 0 })).rejects.toBeInstanceOf(
      AppError,
    );
  });

  it('maps timeouts and malformed JSON', async () => {
    const abortClient = new HttpCyrloMapsClient({
      baseUrl: 'https://maps.example',
      apiKey: 'test-secret-key-value',
      timeoutMs: 5,
      fetchImpl: (async (_url, init) => {
        await new Promise<void>((_, reject) => {
          init?.signal?.addEventListener('abort', () => {
            const err = new Error('aborted');
            err.name = 'AbortError';
            reject(err);
          });
        });
        return jsonResponse(200, {});
      }) as unknown as typeof fetch,
    });
    await expect(abortClient.getConfig()).rejects.toMatchObject({
      status: 504,
      code: 'provider_timeout',
    });

    const badJson = new HttpCyrloMapsClient({
      baseUrl: 'https://maps.example',
      apiKey: 'test-secret-key-value',
      fetchImpl: (async () =>
        new Response('not-json', { status: 200 })) as unknown as typeof fetch,
    });
    await expect(badJson.getConfig()).rejects.toMatchObject({
      status: 502,
      code: 'provider_error',
    });
  });

  it('maps no_route 404', async () => {
    const client = new HttpCyrloMapsClient({
      baseUrl: 'https://maps.example',
      apiKey: 'test-secret-key-value',
      fetchImpl: (async () =>
        jsonResponse(404, {
          error: { code: 'no_route', message: 'No driving route is available' },
          request_id: 'r1',
        })) as unknown as typeof fetch,
    });
    await expect(
      client.route({
        from: { latitude: 6.7, longitude: -1.62 },
        to: { latitude: 6.71, longitude: -1.61 },
      }),
    ).rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' });
  });
});
