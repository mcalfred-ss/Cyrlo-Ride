import { describe, expect, it } from 'vitest';

import { loadEnv } from './env.js';

function baseEnv(overrides: Record<string, string | undefined> = {}): NodeJS.ProcessEnv {
  return {
    NODE_ENV: 'test',
    DATABASE_URL: 'postgresql://localhost:5432/cyrlo_ride_app',
    JWT_ACCESS_SECRET: 'test-only-access-secret-value-0123456789',
    JWT_REFRESH_SECRET: 'test-only-refresh-secret-value-0123456789',
    OTP_HASH_SECRET: 'test-only-otp-hash-secret-value-0123456789',
    ADMIN_BOOTSTRAP_SECRET: 'test-only-admin-bootstrap-secret-0123456789ab',
    ADMIN_MFA_ENCRYPTION_KEY: Buffer.alloc(32, 9).toString('base64'),
    IDENTITY_ENCRYPTION_KEY: Buffer.alloc(32, 13).toString('base64'),
    PAYSTACK_SECRET_KEY: 'sk_test_placeholder',
    RIDER_OFFER_RESPONSE_TIMEOUT_SECONDS: '15',
    ...overrides,
  };
}

describe('loadEnv Vynfy SMS validation', () => {
  it('requires VYNFY_API_KEY and VYNFY_SENDER_ID when SMS_PROVIDER=vynfy', () => {
    expect(() => loadEnv(baseEnv({ SMS_PROVIDER: 'vynfy' }))).toThrow(/VYNFY_API_KEY/);
    expect(() =>
      loadEnv(
        baseEnv({
          SMS_PROVIDER: 'vynfy',
          VYNFY_API_KEY: 'configured-but-not-real',
        }),
      ),
    ).toThrow(/VYNFY_SENDER_ID/);
  });

  it('accepts vynfy when dedicated credentials are present', () => {
    const env = loadEnv(
      baseEnv({
        SMS_PROVIDER: 'vynfy',
        VYNFY_API_KEY: 'configured-but-not-real',
        VYNFY_SENDER_ID: 'Cyrlo',
      }),
    );
    expect(env.SMS_PROVIDER).toBe('vynfy');
    expect(env.VYNFY_API_KEY).toBe('configured-but-not-real');
    expect(env.VYNFY_SENDER_ID).toBe('Cyrlo');
  });

  it('allows empty SMS_PROVIDER without Vynfy credentials (local development)', () => {
    const env = loadEnv(baseEnv({ SMS_PROVIDER: '' }));
    expect(env.SMS_PROVIDER).toBe('');
    expect(env.VYNFY_API_KEY).toBe('');
  });
});
