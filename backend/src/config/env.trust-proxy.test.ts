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

describe('loadEnv TRUST_PROXY validation', () => {
  it('rejects TRUST_PROXY=true at startup', () => {
    expect(() => loadEnv(baseEnv({ TRUST_PROXY: 'true' }))).toThrow(/TRUST_PROXY/);
  });

  it('accepts hop count and exposes trustProxySetting', () => {
    const env = loadEnv(baseEnv({ TRUST_PROXY: '1' }));
    expect(env.trustProxySetting).toBe(1);
  });

  it('keeps false for local development default', () => {
    const env = loadEnv(baseEnv({ TRUST_PROXY: 'false' }));
    expect(env.trustProxySetting).toBe(false);
  });
});
