import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { FcmAccessTokenProvider } from './fcm-auth.js';
import { GoogleFcmAccessTokenProvider } from './fcm-auth.js';
import { assertServiceAccountShape, loadFcmServiceAccountFile } from './fcm-credentials.js';
import {
  buildFcmV1Message,
  classifyFcmHttpV1Error,
  FcmHttpV1PushProvider,
} from './fcm-http-v1.js';
import {
  createPushProvider,
  describePushProvider,
  UnconfiguredPushProvider,
} from './push.provider.js';

function mockTokenProvider(token = 'ya29.test-access-token'): FcmAccessTokenProvider {
  let calls = 0;
  let cached: string | null = token;
  return {
    getAccessToken: async () => {
      calls += 1;
      if (!cached) throw new Error('auth failed');
      return cached;
    },
    invalidate: () => {
      cached = null;
    },
    // test helpers
    get callCount() {
      return calls;
    },
  } as FcmAccessTokenProvider & { callCount: number };
}

describe('FCM credentials', () => {
  it('loads a valid service account file without exposing the private key in describe paths', () => {
    const dir = mkdtempSync(join(tmpdir(), 'fcm-sa-'));
    const path = join(dir, 'sa.json');
    writeFileSync(
      path,
      JSON.stringify({
        type: 'service_account',
        project_id: 'cyrlo-test',
        private_key_id: 'abc',
        private_key: '-----BEGIN PRIVATE KEY-----\nMIIE\n-----END PRIVATE KEY-----\n',
        client_email: 'firebase-adminsdk@cyrlo-test.iam.gserviceaccount.com',
        client_id: '123',
        token_uri: 'https://oauth2.googleapis.com/token',
      }),
    );
    const account = loadFcmServiceAccountFile(path);
    expect(account.project_id).toBe('cyrlo-test');
    expect(() =>
      assertServiceAccountShape({
        type: 'user',
        project_id: 'p',
        private_key_id: 'k',
        private_key: 'pk',
        client_email: 'a@b.com',
        client_id: '1',
      }),
    ).toThrow(/service_account/);
  });

  it('rejects missing configuration safely in the factory', () => {
    const provider = createPushProvider({
      provider: 'fcm',
      projectId: '',
      serviceAccountFile: '',
      nodeEnv: 'production',
    });
    expect(provider).toBeInstanceOf(UnconfiguredPushProvider);
    expect(describePushProvider(provider).ready).toBe(false);
  });
});

describe('classifyFcmHttpV1Error', () => {
  it('deactivates unregistered / invalid tokens only', () => {
    expect(
      classifyFcmHttpV1Error(404, {
        error: {
          status: 'NOT_FOUND',
          details: [{ errorCode: 'UNREGISTERED' }],
        },
      }).outcome,
    ).toBe('invalid_token');

    expect(
      classifyFcmHttpV1Error(403, {
        error: {
          status: 'PERMISSION_DENIED',
          details: [{ errorCode: 'SENDER_ID_MISMATCH' }],
        },
      }).outcome,
    ).toBe('invalid_token');

    expect(
      classifyFcmHttpV1Error(400, {
        error: {
          status: 'INVALID_ARGUMENT',
          message: 'The registration token is not a valid FCM registration token',
          details: [{ errorCode: 'INVALID_ARGUMENT' }],
        },
      }).outcome,
    ).toBe('invalid_token');
  });

  it('retries quota, unavailable, and server errors without invalidating tokens', () => {
    expect(
      classifyFcmHttpV1Error(429, {
        error: { status: 'RESOURCE_EXHAUSTED', details: [{ errorCode: 'QUOTA_EXCEEDED' }] },
      }).outcome,
    ).toBe('retryable');
    expect(
      classifyFcmHttpV1Error(503, { error: { status: 'UNAVAILABLE' } }).outcome,
    ).toBe('retryable');
    expect(classifyFcmHttpV1Error(500, { error: { status: 'INTERNAL' } }).outcome).toBe(
      'retryable',
    );
  });

  it('treats auth and APNs credential failures as permanent operational failures', () => {
    expect(
      classifyFcmHttpV1Error(401, { error: { status: 'UNAUTHENTICATED' } }).outcome,
    ).toBe('failed');
    expect(
      classifyFcmHttpV1Error(401, {
        error: {
          status: 'UNAUTHENTICATED',
          details: [{ errorCode: 'THIRD_PARTY_AUTH_ERROR' }],
        },
      }),
    ).toMatchObject({ outcome: 'failed', code: 'THIRD_PARTY_AUTH_ERROR' });
  });
});

describe('FcmHttpV1PushProvider delivery', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends Android/iOS messages to HTTP v1 with Bearer auth and project endpoint', async () => {
    const fetchImpl = vi.fn(async (url: string | URL, init?: RequestInit) => {
      expect(String(url)).toBe(
        'https://fcm.googleapis.com/v1/projects/cyrlo-test/messages:send',
      );
      expect(init?.method).toBe('POST');
      const headers = init?.headers as Record<string, string>;
      expect(headers.Authorization).toBe('Bearer ya29.test-access-token');
      const parsed = JSON.parse(String(init?.body)) as {
        message: {
          token: string;
          android?: { priority?: string };
          apns?: { headers?: Record<string, string> };
          data?: Record<string, string>;
        };
      };
      expect(parsed.message.token).toBe('device-token-abc');
      expect(parsed.message.android?.priority).toBe('HIGH');
      expect(parsed.message.apns?.headers?.['apns-priority']).toBe('10');
      expect(parsed.message.data?.otp).toBeUndefined();
      expect(parsed.message.data?.latitude).toBeUndefined();
      return new Response(JSON.stringify({ name: 'projects/cyrlo-test/messages/1' }), {
        status: 200,
      });
    });

    const provider = new FcmHttpV1PushProvider({
      projectId: 'cyrlo-test',
      tokenProvider: mockTokenProvider(),
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const result = await provider.sendToToken({
      token: 'device-token-abc',
      platform: 'ANDROID',
      message: {
        title: 'Offer',
        body: 'New ride offer',
        data: {
          eventType: 'matching.offer',
          otp: 'should-strip',
          latitude: '5.6',
          bookingId: 'b1',
        },
      },
    });
    expect(result).toEqual({ outcome: 'sent' });
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(describePushProvider(provider)).toMatchObject({
      adapter: 'fcm-http-v1',
      ready: true,
      iosPath: 'fcm-apns',
    });
  });

  it('builds iOS APNs payload through FCM (no direct APNs provider)', () => {
    const built = buildFcmV1Message({
      token: 'ios-token',
      platform: 'IOS',
      message: { title: 'Trip started', body: 'Your trip is underway' },
    });
    expect(built.message.apns).toBeTruthy();
    expect(built.message.token).toBe('ios-token');
  });

  it('classifies unregistered responses and does not mark temporary network as invalid', async () => {
    const provider = new FcmHttpV1PushProvider({
      projectId: 'cyrlo-test',
      tokenProvider: mockTokenProvider(),
      fetchImpl: (async () =>
        new Response(
          JSON.stringify({
            error: {
              status: 'NOT_FOUND',
              details: [{ errorCode: 'UNREGISTERED' }],
            },
          }),
          { status: 404 },
        )) as unknown as typeof fetch,
    });
    await expect(
      provider.sendToToken({
        token: 'dead-token',
        platform: 'ANDROID',
        message: { title: 't', body: 'b' },
      }),
    ).resolves.toMatchObject({ outcome: 'invalid_token', code: 'UNREGISTERED' });

    const flaky = new FcmHttpV1PushProvider({
      projectId: 'cyrlo-test',
      tokenProvider: mockTokenProvider(),
      fetchImpl: (async () => {
        throw new Error('socket hang up');
      }) as unknown as typeof fetch,
    });
    await expect(
      flaky.sendToToken({
        token: 'alive-token',
        platform: 'IOS',
        message: { title: 't', body: 'b' },
      }),
    ).resolves.toMatchObject({ outcome: 'retryable', code: 'NETWORK' });
  });

  it('surfaces authentication failures as permanent failed outcomes', async () => {
    const provider = new FcmHttpV1PushProvider({
      projectId: 'cyrlo-test',
      tokenProvider: {
        getAccessToken: async () => {
          throw new Error('invalid_grant');
        },
      },
      fetchImpl: vi.fn() as unknown as typeof fetch,
    });
    const result = await provider.sendToToken({
      token: 't',
      platform: 'ANDROID',
      message: { title: 't', body: 'b' },
    });
    expect(result).toMatchObject({ outcome: 'failed', code: 'UNAUTHENTICATED' });
  });
});

describe('GoogleFcmAccessTokenProvider caching', () => {
  it('reuses cached tokens and coalesces concurrent refresh', async () => {
    let issued = 0;
    const fakeAuth = {
      getClient: async () => ({
        getAccessToken: async () => {
          issued += 1;
          await new Promise((r) => setTimeout(r, 20));
          return { token: `tok-${issued}` };
        },
        credentials: { expiry_date: Date.now() + 3_600_000 },
      }),
    };

    const provider = new GoogleFcmAccessTokenProvider(
      {
        type: 'service_account',
        project_id: 'p',
        private_key_id: 'k',
        private_key: 'pk',
        client_email: 'a@b.com',
        client_id: '1',
      },
      // @ts-expect-error test double
      { auth: fakeAuth, skewMs: 60_000 },
    );

    const [a, b] = await Promise.all([
      provider.getAccessToken(),
      provider.getAccessToken(),
    ]);
    expect(a).toBe(b);
    expect(issued).toBe(1);
    const again = await provider.getAccessToken();
    expect(again).toBe(a);
    expect(issued).toBe(1);
  });
});
