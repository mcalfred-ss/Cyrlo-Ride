import { AppError } from '../../common/errors/app-error.js';
import { logger } from '../../config/logger.js';

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
        'SMS provider is not configured. Set SMS_PROVIDER and SMS_API_KEY when a supported vendor adapter is available.',
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

/** Known adapter registry. Empty until a verified vendor contract is wired. */
export const SUPPORTED_SMS_PROVIDERS: readonly string[] = [];

/**
 * Resolves the SMS adapter.
 *
 * - Production without credentials → UnconfiguredSmsProvider (fail closed on send).
 * - Non-production without credentials → DevelopmentSmsProvider.
 * - Credentials with unsupported/unknown SMS_PROVIDER → UnsupportedSmsProvider (fail closed).
 * - Credentials with a supported adapter → that adapter (none registered yet).
 *
 * Do not invent vendor endpoints. Phase 11B documents this as a deployment blocker
 * until the existing SMS vendor contract is supplied for adapter wiring.
 */
export function createSmsProvider(options: {
  provider: string;
  apiKey: string;
  nodeEnv: string;
  senderId?: string;
}): SmsProvider {
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

  // Future: return the registered adapter for providerName.
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
