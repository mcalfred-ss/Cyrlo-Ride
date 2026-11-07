import { AppError } from '../../common/errors/app-error.js';
import { logger } from '../../config/logger.js';
import { maskPhone, type SmsMessage, type SmsProvider } from './sms.provider.js';

/** Documented Vynfy SMS send endpoint (https://www.vynfy.com/developers). */
export const VYNFY_SMS_SEND_URL = 'https://sms.vynfy.com/api/v1/send';

export const VYNFY_SMS_TIMEOUT_MS = 10_000;

/** Soft upper bound — not a Vynfy-documented limit; rejects empty / absurd payloads locally. */
export const VYNFY_SMS_MAX_MESSAGE_CHARS = 1000;

export interface VynfySmsProviderOptions {
  apiKey: string;
  senderId: string;
  /** Injectable for tests. Defaults to global fetch. */
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  /** Override endpoint for isolated tests only — production uses the documented URL. */
  endpointUrl?: string;
}

/**
 * Normalize E.164 Ghana (+233XXXXXXXXX) to Vynfy's documented `233XXXXXXXXX` form.
 * Rejects numbers that are not Ghana mobile E.164.
 */
export function normalizeGhanaRecipientForVynfy(phone: string): string {
  const trimmed = phone.trim();
  const e164 = trimmed.startsWith('+') ? trimmed : trimmed.startsWith('233') ? `+${trimmed}` : trimmed;
  if (!/^\+233\d{9}$/.test(e164)) {
    throw new AppError({
      status: 400,
      code: 'VALIDATION_ERROR',
      message: 'Destination phone number must be a Ghana E.164 number (+233XXXXXXXXX)',
    });
  }
  return e164.slice(1); // 233XXXXXXXXX
}

function assertMessage(body: string): string {
  const message = body.trim();
  if (!message) {
    throw new AppError({
      status: 400,
      code: 'VALIDATION_ERROR',
      message: 'SMS message body is required',
    });
  }
  if (message.length > VYNFY_SMS_MAX_MESSAGE_CHARS) {
    throw new AppError({
      status: 400,
      code: 'VALIDATION_ERROR',
      message: 'SMS message body exceeds allowed length',
    });
  }
  return message;
}

function safeProviderErrorMessage(status: number): string {
  if (status === 401 || status === 403) {
    return 'SMS provider authentication failed';
  }
  if (status === 429) {
    return 'SMS provider rate limited the request';
  }
  if (status >= 500) {
    return 'SMS provider server error';
  }
  if (status >= 400) {
    return 'SMS provider rejected the request';
  }
  return 'SMS provider request failed';
}

/**
 * Vynfy SMS transport adapter.
 *
 * Uses only the publicly documented send contract:
 * POST https://sms.vynfy.com/api/v1/send with X-API-Key and JSON
 * { sender, recipients, message }.
 *
 * HTTP 2xx means API acceptance only — not confirmed handset delivery.
 * Response body fields are not part of a documented schema; they are never
 * required for success and are never logged in full.
 */
export class VynfySmsProvider implements SmsProvider {
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly endpointUrl: string;

  constructor(private readonly options: VynfySmsProviderOptions) {
    if (!options.apiKey.trim()) {
      throw new AppError({
        status: 503,
        code: 'SERVICE_UNAVAILABLE',
        message: 'Vynfy SMS API key is not configured',
      });
    }
    if (!options.senderId.trim()) {
      throw new AppError({
        status: 503,
        code: 'SERVICE_UNAVAILABLE',
        message: 'Vynfy SMS sender ID is not configured',
      });
    }
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? VYNFY_SMS_TIMEOUT_MS;
    this.endpointUrl = options.endpointUrl ?? VYNFY_SMS_SEND_URL;
  }

  describe() {
    return { configured: true, adapter: 'vynfy', ready: true };
  }

  async send(message: SmsMessage): Promise<void> {
    const recipient = normalizeGhanaRecipientForVynfy(message.to);
    const text = assertMessage(message.body);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    let response: Response;
    try {
      response = await this.fetchImpl(this.endpointUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': this.options.apiKey,
        },
        body: JSON.stringify({
          sender: this.options.senderId,
          recipients: [recipient],
          message: text,
        }),
        signal: controller.signal,
      });
    } catch (error) {
      const aborted =
        (error instanceof Error && error.name === 'AbortError') ||
        (typeof error === 'object' &&
          error !== null &&
          'name' in error &&
          (error as { name?: string }).name === 'AbortError');
      logger.warn(
        {
          to: maskPhone(message.to),
          adapter: 'vynfy',
          reason: aborted ? 'timeout' : 'network_error',
        },
        'Vynfy SMS request failed before a usable response',
      );
      throw new AppError({
        status: 503,
        code: 'SERVICE_UNAVAILABLE',
        message: aborted
          ? 'SMS provider request timed out; delivery status is ambiguous'
          : 'SMS provider network error',
      });
    } finally {
      clearTimeout(timer);
    }

    // Read body for diagnostics only — never log raw body (may echo message/OTP).
    let parsed: unknown = null;
    let bodyText = '';
    try {
      bodyText = await response.text();
      if (bodyText.trim()) {
        parsed = JSON.parse(bodyText) as unknown;
      }
    } catch {
      parsed = null;
    }

    if (!response.ok) {
      logger.warn(
        {
          to: maskPhone(message.to),
          adapter: 'vynfy',
          httpStatus: response.status,
          // Do not log response body — may contain sensitive echo or keys.
          bodyParseable: parsed !== null,
        },
        'Vynfy SMS API rejected the send request',
      );
      throw new AppError({
        status: response.status === 429 ? 429 : 503,
        code: response.status === 429 ? 'RATE_LIMITED' : 'SERVICE_UNAVAILABLE',
        message: safeProviderErrorMessage(response.status),
      });
    }

    // 2xx with non-JSON body: still treat as API acceptance (schema undocumented).
    if (bodyText.trim() && parsed === null) {
      logger.warn(
        {
          to: maskPhone(message.to),
          adapter: 'vynfy',
          httpStatus: response.status,
        },
        'Vynfy SMS API returned non-JSON body on success; treating as acceptance only',
      );
    }

    logger.info(
      {
        to: maskPhone(message.to),
        adapter: 'vynfy',
        httpStatus: response.status,
        apiAccepted: true,
        deliveryConfirmed: false,
      },
      'Vynfy SMS API accepted send request (not confirmed handset delivery)',
    );
  }
}
