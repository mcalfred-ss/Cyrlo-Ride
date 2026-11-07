import { randomBytes } from 'node:crypto';

import { z } from 'zod';

import { parseTrustProxyEnv, type TrustProxySetting } from './trust-proxy.js';

const placeholderPattern = /change-me|development-only/;

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    HOST: z.string().min(1).default('0.0.0.0'),
    PORT: z.coerce.number().int().positive().default(3000),
    DATABASE_URL: z.string().min(1),
    CORS_ORIGINS: z
      .string()
      .default('')
      .transform((value) =>
        value
          .split(',')
          .map((origin) => origin.trim())
          .filter((origin) => origin.length > 0),
      ),
    JWT_ACCESS_SECRET: z.string().min(32),
    JWT_REFRESH_SECRET: z.string().min(32),
    JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().positive().default(900),
    JWT_REFRESH_TTL_SECONDS: z.coerce.number().int().positive().default(2_592_000),
    JWT_ISSUER: z.string().min(1).default('cyrlo-ride'),
    JWT_AUDIENCE: z.string().min(1).default('cyrlo-ride-clients'),
    OTP_TTL_SECONDS: z.coerce.number().int().positive().default(300),
    OTP_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
    OTP_RESEND_COOLDOWN_SECONDS: z.coerce.number().int().positive().default(60),
    OTP_HASH_SECRET: z.string().min(32),
    OTP_DEV_EXPOSE_CODE: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
    OTP_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(900_000),
    OTP_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(10),
    /** One-time Super Admin bootstrap secret. Empty disables bootstrap endpoint. */
    ADMIN_BOOTSTRAP_SECRET: z.string().default(''),
    /** 32-byte key, base64-encoded, for AES-GCM TOTP secret encryption. */
    ADMIN_MFA_ENCRYPTION_KEY: z.string().min(1),
    /** Separate 32-byte key for Ghana Card / identity ciphertext. Must differ from MFA key. */
    IDENTITY_ENCRYPTION_KEY: z.string().min(1),
    IDENTITY_ENCRYPTION_KEY_VERSION: z.coerce.number().int().positive().default(1),
    ADMIN_INVITE_TTL_SECONDS: z.coerce.number().int().positive().default(259_200),
    ADMIN_MFA_PENDING_TTL_SECONDS: z.coerce.number().int().positive().default(600),
    ADMIN_RECENT_MFA_SECONDS: z.coerce.number().int().positive().default(900),
    TOTP_ISSUER: z.string().min(1).default('Cyrlo Ride Admin'),
    R2_ACCOUNT_ID: z.string().default(''),
    R2_ACCESS_KEY_ID: z.string().default(''),
    R2_SECRET_ACCESS_KEY: z.string().default(''),
    R2_BUCKET: z.string().default(''),
    R2_SIGNED_URL_TTL_SECONDS: z.coerce.number().int().positive().default(60),
    RIDER_DOC_RETENTION_MONTHS_AFTER_CLOSURE: z.coerce.number().int().positive().default(12),
    PAYSTACK_SECRET_KEY: z.string().default(''),
    PAYSTACK_PUBLIC_KEY: z.string().default(''),
    /**
     * Required before matching dispatch creates offers.
     * No default — GPS freshness (30s) must not be reused as the offer timeout.
     * Operator must set an explicit product-approved value.
     */
    RIDER_OFFER_RESPONSE_TIMEOUT_SECONDS: z.preprocess(
      (value) => (value === '' || value === undefined || value === null ? undefined : value),
      z.coerce.number().int().positive().optional(),
    ),
    SMS_PROVIDER: z.string().default(''),
    SMS_API_KEY: z.string().default(''),
    SMS_SENDER_ID: z.string().default('Cyrlo'),
    /**
     * Push adapter: `fcm` (HTTP v1) | `fcm-legacy` (deprecated server key) | empty (dev memory / prod fail-closed).
     */
    PUSH_PROVIDER: z.string().default(''),
    /** @deprecated Legacy FCM server key — only with PUSH_PROVIDER=fcm-legacy. */
    PUSH_API_KEY: z.string().default(''),
    /** Firebase project id for FCM HTTP v1 endpoint. */
    FCM_PROJECT_ID: z.string().default(''),
    /**
     * Absolute or relative path to the Google service-account JSON file.
     * Never commit the file; mount at runtime. Do not put the private key in env vars.
     */
    FCM_SERVICE_ACCOUNT_FILE: z.string().default(''),
    NOTIFICATION_OUTBOX_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
    NOTIFICATION_OUTBOX_POLL_MS: z.coerce.number().int().positive().default(3_000),
    NOTIFICATION_STALE_PROCESSING_MS: z.coerce.number().int().positive().default(120_000),
    MAPS_PROVIDER: z.string().default(''),
    MAPS_API_KEY: z.string().default(''),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    /**
     * Proxy trust for Express req.ip / rate limits.
     * `false` | hop count 1–5 | comma-separated IPs/CIDRs.
     * Bare `true` is rejected (see parseTrustProxyEnv).
     */
    TRUST_PROXY: z.string().default('false'),
    RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(900_000),
    RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),
  })
  .superRefine((value, ctx) => {
    if (value.JWT_ACCESS_SECRET === value.JWT_REFRESH_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['JWT_REFRESH_SECRET'],
        message: 'JWT access and refresh secrets must be different',
      });
    }
    for (const key of ['ADMIN_MFA_ENCRYPTION_KEY', 'IDENTITY_ENCRYPTION_KEY'] as const) {
      try {
        if (Buffer.from(value[key], 'base64').length !== 32) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [key],
            message: `${key} must decode to exactly 32 bytes`,
          });
        }
      } catch {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: `${key} must be valid base64`,
        });
      }
    }
    if (value.ADMIN_MFA_ENCRYPTION_KEY === value.IDENTITY_ENCRYPTION_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['IDENTITY_ENCRYPTION_KEY'],
        message: 'IDENTITY_ENCRYPTION_KEY must differ from ADMIN_MFA_ENCRYPTION_KEY',
      });
    }
    if (value.NODE_ENV !== 'production') return;
    for (const key of [
      'JWT_ACCESS_SECRET',
      'JWT_REFRESH_SECRET',
      'OTP_HASH_SECRET',
      'ADMIN_BOOTSTRAP_SECRET',
    ] as const) {
      if (key === 'ADMIN_BOOTSTRAP_SECRET' && value[key].length === 0) continue;
      if (placeholderPattern.test(value[key])) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: `${key} still uses a development placeholder`,
        });
      }
    }
    if (!value.PAYSTACK_SECRET_KEY.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['PAYSTACK_SECRET_KEY'],
        message: 'PAYSTACK_SECRET_KEY is required in production',
      });
    }
    if (!value.RIDER_OFFER_RESPONSE_TIMEOUT_SECONDS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['RIDER_OFFER_RESPONSE_TIMEOUT_SECONDS'],
        message:
          'RIDER_OFFER_RESPONSE_TIMEOUT_SECONDS must be set explicitly before production matching dispatch',
      });
    }
  });

export type Env = z.infer<typeof envSchema> & {
  trustProxySetting: TrustProxySetting;
};

export function formatEnvError(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.join('.') || 'environment'}: ${issue.message}`)
    .join('\n');
}

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    throw new Error(`Invalid environment configuration:\n${formatEnvError(parsed.error)}`);
  }
  try {
    const trustProxySetting = parseTrustProxyEnv(parsed.data.TRUST_PROXY);
    return { ...parsed.data, trustProxySetting };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid TRUST_PROXY';
    throw new Error(`Invalid environment configuration:\nTRUST_PROXY: ${message}`);
  }
}

export function canExposeDevelopmentOtp(envValue: Env): boolean {
  return envValue.NODE_ENV !== 'production' && envValue.OTP_DEV_EXPOSE_CODE;
}

/** Helper for generating a local encryption key (never commit the result). */
export function generateMfaEncryptionKey(): string {
  return randomBytes(32).toString('base64');
}

export const env = loadEnv();
