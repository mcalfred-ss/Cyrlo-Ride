import { randomBytes } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { loadEnv } from './env.js';

function strongKey(seed: number): string {
  const buf = Buffer.alloc(32);
  for (let i = 0; i < 32; i += 1) buf[i] = (seed * 17 + i * 13) % 256;
  // Ensure high entropy for weak-key guard.
  return Buffer.concat([buf.slice(0, 16), randomBytes(16)]).toString('base64');
}

function baseEnv(overrides: Record<string, string | undefined> = {}): NodeJS.ProcessEnv {
  return {
    NODE_ENV: 'test',
    DATABASE_URL: 'postgresql://localhost:5432/cyrlo_ride_app',
    JWT_ACCESS_SECRET: 'test-only-access-secret-value-0123456789',
    JWT_REFRESH_SECRET: 'test-only-refresh-secret-value-0123456789',
    OTP_HASH_SECRET: 'test-only-otp-hash-secret-value-0123456789',
    ADMIN_BOOTSTRAP_SECRET: 'test-only-admin-bootstrap-secret-0123456789ab',
    ADMIN_MFA_ENCRYPTION_KEY: strongKey(1),
    IDENTITY_ENCRYPTION_KEY: strongKey(2),
    PAYSTACK_SECRET_KEY: 'sk_test_placeholder',
    RIDER_OFFER_RESPONSE_TIMEOUT_SECONDS: '15',
    TRUST_PROXY: 'false',
    ...overrides,
  };
}

function productionEnv(overrides: Record<string, string | undefined> = {}): NodeJS.ProcessEnv {
  return baseEnv({
    NODE_ENV: 'production',
    JWT_ACCESS_SECRET: 'production-grade-access-secret-value-0123456789ab',
    JWT_REFRESH_SECRET: 'production-grade-refresh-secret-value-0123456789a',
    OTP_HASH_SECRET: 'production-grade-otp-hash-secret-value-0123456789abc',
    ADMIN_BOOTSTRAP_SECRET: '',
    PAYSTACK_SECRET_KEY: 'sk_live_not_real_but_present',
    TRUST_PROXY: '1',
    ...overrides,
  });
}

describe('production TRUST_PROXY requirements', () => {
  it('rejects TRUST_PROXY=false in production without DIRECT acknowledgment', () => {
    expect(() => loadEnv(productionEnv({ TRUST_PROXY: 'false' }))).toThrow(/TRUST_PROXY/);
  });

  it('accepts hop count in production', () => {
    const env = loadEnv(productionEnv({ TRUST_PROXY: '1' }));
    expect(env.trustProxySetting).toBe(1);
  });

  it('accepts CIDR list in production', () => {
    const env = loadEnv(productionEnv({ TRUST_PROXY: '10.0.0.0/8,127.0.0.1' }));
    expect(env.trustProxySetting).toEqual(['10.0.0.0/8', '127.0.0.1']);
  });

  it('allows intentional direct exposure only with TRUST_PROXY_DIRECT=true', () => {
    const env = loadEnv(
      productionEnv({
        TRUST_PROXY: 'false',
        TRUST_PROXY_DIRECT: 'true',
      }),
    );
    expect(env.trustProxySetting).toBe(false);
    expect(env.TRUST_PROXY_DIRECT).toBe(true);
  });

  it('keeps local development safe with TRUST_PROXY=false', () => {
    const env = loadEnv(baseEnv({ NODE_ENV: 'development', TRUST_PROXY: 'false' }));
    expect(env.trustProxySetting).toBe(false);
  });
});

describe('production encryption key validation', () => {
  it('rejects published example MFA key in production', () => {
    expect(() =>
      loadEnv(
        productionEnv({
          ADMIN_MFA_ENCRYPTION_KEY: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
        }),
      ),
    ).toThrow(/ADMIN_MFA_ENCRYPTION_KEY/);
  });

  it('rejects published example identity key in production', () => {
    expect(() =>
      loadEnv(
        productionEnv({
          IDENTITY_ENCRYPTION_KEY: 'AgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgI=',
        }),
      ),
    ).toThrow(/IDENTITY_ENCRYPTION_KEY/);
  });

  it('rejects reused purpose-specific keys', () => {
    const shared = strongKey(9);
    expect(() =>
      loadEnv(
        productionEnv({
          ADMIN_MFA_ENCRYPTION_KEY: shared,
          IDENTITY_ENCRYPTION_KEY: shared,
        }),
      ),
    ).toThrow(/must differ/);
  });

  it('rejects wrong-sized keys in any environment', () => {
    expect(() =>
      loadEnv(
        baseEnv({
          ADMIN_MFA_ENCRYPTION_KEY: Buffer.alloc(16).toString('base64'),
        }),
      ),
    ).toThrow(/32 bytes/);
  });

  it('accepts valid distinct keys and never puts secrets in the thrown message', () => {
    const mfa = strongKey(3);
    const identity = strongKey(4);
    const env = loadEnv(
      productionEnv({
        ADMIN_MFA_ENCRYPTION_KEY: mfa,
        IDENTITY_ENCRYPTION_KEY: identity,
      }),
    );
    expect(env.ADMIN_MFA_ENCRYPTION_KEY).toBe(mfa);
    expect(env.IDENTITY_ENCRYPTION_KEY).toBe(identity);
    expect(env.ADMIN_MFA_ENCRYPTION_KEY).not.toBe(env.IDENTITY_ENCRYPTION_KEY);

    try {
      loadEnv(
        productionEnv({
          ADMIN_MFA_ENCRYPTION_KEY: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
        }),
      );
      expect.unreachable('expected throw');
    } catch (error) {
      const text = String(error);
      expect(text).not.toContain('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=');
    }
  });

  it('allows example keys outside production for local workflows', () => {
    const env = loadEnv(
      baseEnv({
        NODE_ENV: 'development',
        ADMIN_MFA_ENCRYPTION_KEY: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
        IDENTITY_ENCRYPTION_KEY: 'AgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgI=',
      }),
    );
    expect(env.NODE_ENV).toBe('development');
  });
});

describe('OTP_DEV_EXPOSE_CODE production fail-closed', () => {
  it('rejects OTP_DEV_EXPOSE_CODE=true when NODE_ENV=production', () => {
    expect(() => loadEnv(productionEnv({ OTP_DEV_EXPOSE_CODE: 'true' }))).toThrow(
      /OTP_DEV_EXPOSE_CODE/,
    );
  });

  it('allows OTP_DEV_EXPOSE_CODE=false in production', () => {
    const env = loadEnv(productionEnv({ OTP_DEV_EXPOSE_CODE: 'false' }));
    expect(env.OTP_DEV_EXPOSE_CODE).toBe(false);
  });

  it('allows OTP_DEV_EXPOSE_CODE=true only outside production', () => {
    const env = loadEnv(baseEnv({ NODE_ENV: 'development', OTP_DEV_EXPOSE_CODE: 'true' }));
    expect(env.OTP_DEV_EXPOSE_CODE).toBe(true);
  });
});
