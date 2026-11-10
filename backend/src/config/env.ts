import { randomBytes } from 'node:crypto';

import { z } from 'zod';

import {
  encryptionKeyErrorMessage,
  inspectEncryptionKey,
} from './encryption-keys.js';
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
    // 90 days — riders/passengers stay signed in until they log out or the refresh lapses.
    JWT_REFRESH_TTL_SECONDS: z.coerce.number().int().positive().default(7_776_000),
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
    /**
     * Object storage vendor. Use `bunny` for Bunny.net Edge Storage + CDN token URLs.
     * Empty / other → unconfigured unless legacy R2_* credentials are present.
     */
    STORAGE_PROVIDER: z.string().default(''),
    BUNNY_STORAGE_ZONE_NAME: z.string().default(''),
    /** Storage zone password (AccessKey header). Never commit. */
    BUNNY_STORAGE_ACCESS_KEY: z.string().default(''),
    /** From Bunny zone FTP & HTTP API info, e.g. storage.bunnycdn.com */
    BUNNY_STORAGE_HOSTNAME: z.string().default('storage.bunnycdn.com'),
    /** Pull zone base URL, e.g. https://cyrlo-ride.b-cdn.net */
    BUNNY_CDN_BASE_URL: z.string().default(''),
    /** Pull zone Token Authentication key (Advanced HS256). */
    BUNNY_CDN_TOKEN_KEY: z.string().default(''),
    OBJECT_STORAGE_SIGNED_URL_TTL_SECONDS: z.coerce.number().int().positive().default(60),
    /** @deprecated Legacy Cloudflare R2 — prefer STORAGE_PROVIDER=bunny. */
    R2_ACCOUNT_ID: z.string().default(''),
    R2_ACCESS_KEY_ID: z.string().default(''),
    R2_SECRET_ACCESS_KEY: z.string().default(''),
    R2_BUCKET: z.string().default(''),
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
    /**
     * SMS adapter selection. Use `vynfy` for production OTP delivery.
     * Empty → development no-op outside production; fail-closed in production.
     * Do not confuse with PUSH_PROVIDER.
     */
    SMS_PROVIDER: z.string().default(''),
    /** Generic vendor key placeholder for non-Vynfy adapters (unused when SMS_PROVIDER=vynfy). */
    SMS_API_KEY: z.string().default(''),
    SMS_SENDER_ID: z.string().default('Cyrlo'),
    /** Vynfy SMS API key — never commit; required when SMS_PROVIDER=vynfy. */
    VYNFY_API_KEY: z.string().default(''),
    /** Vynfy registered sender / brand ID — required when SMS_PROVIDER=vynfy. */
    VYNFY_SENDER_ID: z.string().default(''),
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
    /**
     * Legacy placeholders — unused by the hosted Cyrlo Maps client.
     * Prefer CYRLO_MAPS_BASE_URL + CYRLO_MAPS_API_KEY.
     */
    MAPS_PROVIDER: z.string().default(''),
    /**
     * Legacy. If this is a Mapbox public `pk.` token it is also used as a
     * fallback for MAPBOX_ACCESS_TOKEN (Flutter tiles via GET /maps/config).
     * Prefer MAPBOX_ACCESS_TOKEN + CYRLO_MAPS_API_KEY.
     */
    MAPS_API_KEY: z.string().default(''),
    /**
     * Public Mapbox token (`pk.`) for Flutter raster tiles / device Directions.
     * Exposed to authenticated clients via GET /maps/config. Never put `sk.` here.
     */
    MAPBOX_ACCESS_TOKEN: z.string().default(''),
    /**
     * Hosted Cyrlo Maps API origin (no trailing slash), e.g. https://api.cyrlomap.eqostack.com
     * Empty → maps routes fail closed with NOT_IMPLEMENTED.
     */
    CYRLO_MAPS_BASE_URL: z.string().default('https://api.cyrlomap.eqostack.com'),
    /**
     * Maps API bearer secret only (not name:secret, not a Mapbox token).
     * Never commit; load from /etc/cyrlo-ride/providers.env on the VPS.
     */
    CYRLO_MAPS_API_KEY: z.string().default(''),
    CYRLO_MAPS_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    /**
     * Proxy trust for Express req.ip / rate limits.
     * `false` | hop count 1–5 | comma-separated IPs/CIDRs.
     * Bare `true` is rejected (see parseTrustProxyEnv).
     * Production behind a reverse proxy must set an explicit hop count or CIDR list.
     */
    TRUST_PROXY: z.string().default('false'),
    /**
     * Escape hatch: allow TRUST_PROXY=false in production only when the process is
     * intentionally exposed without a reverse proxy (not the VPS Nginx topology).
     */
    TRUST_PROXY_DIRECT: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
    RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(900_000),
    RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),
    /** Isolated Paystack webhook limiter (does not share the general API bucket). */
    PAYSTACK_WEBHOOK_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
    PAYSTACK_WEBHOOK_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(120),
    /** Isolated rider GPS update limiter (per authenticated user). */
    RIDER_GPS_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
    RIDER_GPS_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(120),
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
      const inspected = inspectEncryptionKey(value[key]);
      if (!inspected.ok && inspected.issue) {
        // Length/format always enforced; example/weak keys only fail closed in production
        // so local .env.example workflows keep working.
        const enforceAlways =
          inspected.issue === 'missing' ||
          inspected.issue === 'invalid_base64' ||
          inspected.issue === 'wrong_length' ||
          value.NODE_ENV === 'production';
        if (enforceAlways) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [key],
            message: encryptionKeyErrorMessage(key, inspected.issue),
          });
        }
      }
    }
    if (value.ADMIN_MFA_ENCRYPTION_KEY === value.IDENTITY_ENCRYPTION_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['IDENTITY_ENCRYPTION_KEY'],
        message: 'IDENTITY_ENCRYPTION_KEY must differ from ADMIN_MFA_ENCRYPTION_KEY',
      });
    }
    // Vynfy credentials are required whenever that adapter is selected (any NODE_ENV).
    const smsProvider = value.SMS_PROVIDER.trim().toLowerCase();
    if (smsProvider === 'vynfy') {
      if (!value.VYNFY_API_KEY.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['VYNFY_API_KEY'],
          message: 'VYNFY_API_KEY is required when SMS_PROVIDER=vynfy',
        });
      }
      if (!value.VYNFY_SENDER_ID.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['VYNFY_SENDER_ID'],
          message: 'VYNFY_SENDER_ID is required when SMS_PROVIDER=vynfy',
        });
      }
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
    if (smsProvider === 'vynfy' && placeholderPattern.test(value.VYNFY_API_KEY)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['VYNFY_API_KEY'],
        message: 'VYNFY_API_KEY still uses a development placeholder',
      });
    }
    // Production behind Nginx (typical VPS) must set an explicit hop/CIDR trust policy.
    // TRUST_PROXY=false is only allowed with TRUST_PROXY_DIRECT=true (intentional direct exposure).
    const trustRaw = value.TRUST_PROXY.trim().toLowerCase();
    const trustIsOff = trustRaw.length === 0 || trustRaw === 'false' || trustRaw === '0';
    if (trustIsOff && !value.TRUST_PROXY_DIRECT) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['TRUST_PROXY'],
        message:
          'Production requires an explicit TRUST_PROXY hop count (e.g. 1) or trusted CIDR list when behind a reverse proxy. Set TRUST_PROXY_DIRECT=true only if the process is intentionally exposed without a proxy.',
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
