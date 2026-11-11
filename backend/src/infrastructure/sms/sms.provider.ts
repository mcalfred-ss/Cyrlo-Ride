import { AppError } from '../../common/errors/app-error.js';
import { logger } from '../../config/logger.js';
import { VynfySmsProvider } from './vynfy-sms.provider.js';

export interface SmsMessage {
  to: string;
  body: string;
}

export interface SmsProvider {
  send(message: SmsMessage): Promise<void>;
  /** Adapter readiness for health/ops (no secrets). */
  describe?(): { configured: boolean; adapter: string; ready: boolean };
}

/** Production-safe stub when no vendor is configured. */
export class UnconfiguredSmsProvider implements SmsProvider {
  async send(): Promise<void> {
    throw new AppError({
      status: 503,
      code: 'SERVICE_UNAVAILABLE',
      message:
        'SMS provider is not configured. Set SMS_PROVIDER=vynfy with VYNFY_API_KEY and VYNFY_SENDER_ID (auth OTP uses Vynfy /otp APIs).',
    });
  }

  describe() {
    return { configured: false, adapter: 'none', ready: false };
  }
}

/**
 * Credentials present but SMS_PROVIDER is not a wired adapter.
 * Fail closed on send — never pretend delivery succeeded.
 */
export class UnsupportedSmsProvider implements SmsProvider {
  constructor(private readonly providerName: string) {}

  async send(): Promise<void> {
    throw new AppError({
      status: 503,
      code: 'SERVICE_UNAVAILABLE',
      message: `SMS provider "${this.providerName}" has no server adapter. Wire the existing vendor contract before production OTP.`,
    });
  }

  describe() {
    return { configured: true, adapter: this.providerName, ready: false };
  }
}

/**
 * Development/test provider that accepts a send without calling a vendor.
 * Never logs the message body (OTP must not appear in logs).
 */
export class DevelopmentSmsProvider implements SmsProvider {
  readonly sent: SmsMessage[] = [];

  async send(message: SmsMessage): Promise<void> {
    this.sent.push({ to: message.to, body: '[redacted]' });
    logger.info({ to: maskPhone(message.to) }, 'development SMS accepted (body not logged)');
  }

  describe() {
    return { configured: true, adapter: 'development', ready: true };
  }
}

export function maskPhone(phone: string): string {
  if (phone.length < 6) return '***';
  return `${phone.slice(0, 4)}****${phone.slice(-2)}`;
}

/** Registered production SMS adapters. */
export const SUPPORTED_SMS_PROVIDERS: readonly string[] = ['vynfy'];

export interface CreateSmsProviderOptions {
  provider: string;
  /**
   * API key for the selected provider.
   * For `vynfy`, pass `VYNFY_API_KEY` (never log or return this value).
   */
  apiKey: string;
  nodeEnv: string;
  /** Sender ID / brand. For `vynfy`, pass `VYNFY_SENDER_ID`. */
  senderId?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

/**
 * Resolves the SMS adapter.
 *
 * - Production without credentials → UnconfiguredSmsProvider (fail closed on send).
 * - Non-production without credentials → DevelopmentSmsProvider.
 * - Credentials with unsupported/unknown SMS_PROVIDER → UnsupportedSmsProvider (fail closed).
 * - SMS_PROVIDER=vynfy with key + sender → VynfySmsProvider.
 *
 * Never silently falls back from a selected production provider to development.
 */
export function createSmsProvider(options: CreateSmsProviderOptions): SmsProvider {
  const providerName = options.provider.trim().toLowerCase();
  const hasCredentials = providerName.length > 0 && options.apiKey.trim().length > 0;

  if (!hasCredentials) {
    if (options.nodeEnv === 'production') {
      return new UnconfiguredSmsProvider();
    }
    return new DevelopmentSmsProvider();
  }

  if (!SUPPORTED_SMS_PROVIDERS.includes(providerName)) {
    logger.warn(
      { smsProvider: providerName },
      'SMS credentials present but no supported adapter is registered',
    );
    return new UnsupportedSmsProvider(providerName);
  }

  if (providerName === 'vynfy') {
    const senderId = (options.senderId ?? '').trim();
    if (!senderId) {
      logger.warn({ smsProvider: 'vynfy' }, 'VYNFY_SENDER_ID missing; SMS adapter not ready');
      return new UnconfiguredSmsProvider();
    }
    return new VynfySmsProvider({
      apiKey: options.apiKey,
      senderId,
      fetchImpl: options.fetchImpl,
      timeoutMs: options.timeoutMs,
    });
  }

  return new UnsupportedSmsProvider(providerName);
}

export function describeSmsProvider(provider: SmsProvider): {
  configured: boolean;
  adapter: string;
  ready: boolean;
} {
  if (typeof provider.describe === 'function') {
    return provider.describe();
  }
  return { configured: false, adapter: 'unknown', ready: false };
}

/**
 * Map env into createSmsProvider options.
 * Vynfy uses dedicated VYNFY_* credentials; other providers keep SMS_API_KEY / SMS_SENDER_ID.
 */
export function smsOptionsFromEnv(envValue: {
  SMS_PROVIDER: string;
  SMS_API_KEY: string;
  SMS_SENDER_ID: string;
  VYNFY_API_KEY: string;
  VYNFY_SENDER_ID: string;
  NODE_ENV: string;
}): CreateSmsProviderOptions {
  const provider = envValue.SMS_PROVIDER.trim();
  if (provider.toLowerCase() === 'vynfy') {
    return {
      provider: 'vynfy',
      apiKey: envValue.VYNFY_API_KEY,
      senderId: envValue.VYNFY_SENDER_ID,
      nodeEnv: envValue.NODE_ENV,
    };
  }
  return {
    provider,
    apiKey: envValue.SMS_API_KEY,
    senderId: envValue.SMS_SENDER_ID,
    nodeEnv: envValue.NODE_ENV,
  };
}
