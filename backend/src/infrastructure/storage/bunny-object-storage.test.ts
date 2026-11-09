import { describe, expect, it, vi } from 'vitest';

import { BunnyObjectStorage } from './bunny-object-storage.js';

describe('BunnyObjectStorage', () => {
  it('uploads with AccessKey and Checksum headers', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 201 }));
    const storage = new BunnyObjectStorage({
      storageZoneName: 'cyrlo-docs',
      storageAccessKey: 'zone-password',
      storageHostname: 'storage.bunnycdn.com',
      cdnBaseUrl: 'https://cyrlo.b-cdn.net',
      cdnTokenKey: 'cdn-token-key',
      signedUrlTtlSeconds: 60,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      now: () => new Date('2020-01-01T00:00:00.000Z'),
    });

    const body = Buffer.from('hello-doc');
    const stored = await storage.put({
      riderId: '11111111-1111-1111-1111-111111111111',
      kind: 'GHANA_CARD',
      contentType: 'image/jpeg',
      body,
    });

    expect(stored.sizeBytes).toBe(body.length);
    expect(stored.storageKey.startsWith('riders/11111111-1111-1111-1111-111111111111/')).toBe(
      true,
    );
    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(String(url)).toMatch(
      /^https:\/\/storage\.bunnycdn\.com\/cyrlo-docs\/riders\//,
    );
    expect(init?.method).toBe('PUT');
    expect((init?.headers as Record<string, string>).AccessKey).toBe('zone-password');
    expect((init?.headers as Record<string, string>).Checksum).toBe(
      stored.checksumSha256.toUpperCase(),
    );
  });

  it('signs CDN download URLs for rider keys only', async () => {
    const storage = new BunnyObjectStorage({
      storageZoneName: 'cyrlo-docs',
      storageAccessKey: 'zone-password',
      storageHostname: 'storage.bunnycdn.com',
      cdnBaseUrl: 'https://cyrlo.b-cdn.net',
      cdnTokenKey: 'cdn-token-key',
      signedUrlTtlSeconds: 60,
      now: () => new Date(1_598_024_527_000),
    });

    const url = await storage.getSignedDownloadUrl('riders/abc/ghana_card/x.jpg', 60);
    expect(url.startsWith('https://cyrlo.b-cdn.net/riders/abc/ghana_card/x.jpg?token=HS256-')).toBe(
      true,
    );
    expect(url).toContain('&expires=1598024587');

    await expect(storage.getSignedDownloadUrl('other/key.jpg')).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
  });
});
