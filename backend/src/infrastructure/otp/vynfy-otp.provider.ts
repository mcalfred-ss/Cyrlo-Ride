import { AppError } from '../../common/errors/app-error.js';
import { logger } from '../../config/logger.js';
import { maskPhone } from '../sms/sms.provider.js';
import { normalizeGhanaRecipientForVynfy } from '../sms/vynfy-sms.provider.js';
import type { PhoneOtpProvider, PhoneOtpRequestInput, PhoneOtpRequestResult } from './phone-otp.provider.js';

/** Documented Vynfy OTP endpoints (https://www.vynfy.com/api-documentation). */
export const VYNFY_OTP_GENERATE_URL = 'https://sms.vynfy.com/otp/generate';
export const VYNFY_OTP_VERIFY_URL = 'https://sms.vynfy.com/otp/verify';

export const VYNFY_OTP_TIMEOUT_MS = 10_000;

/** Vynfy rejects messages over 160 chars; placeholder is required. */
export const VYNFY_OTP_MESSAGE_TEMPLATE =
  'Your Cyrlo Ride code is %otp_code%. Valid for %expiry% minutes.';

export interface VynfyOtpProviderOptions {
  apiKey: string;
  senderId: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  generateUrl?: string;
  verifyUrl?: string;
}

function buildMessage(expiryMinutes: number): string {
  const message = VYNFY_OTP_MESSAGE_TEMPLATE.replace('%expiry%', String(expiryMinutes));
  if (!message.includes('%otp_code%')) {
    throw new AppError({
      status: 500,
      code: 'INTERNAL_ERROR',
      message: 'OTP message template must include %otp_code%',
    });
  }
  if (message.length > 160) {
    throw new AppError({
      status: 500,
      code: 'INTERNAL_ERROR',
      message: 'OTP message template exceeds 160 characters',
    });
  }
  return message;
}

function safeOtpProviderError(status: number, code?: string): { status: number; code: string; message: string } {
  if (code === 'OTP_PENDING' || status === 429) {
    return {
      status: 429,
      code: 'RATE_LIMITED',
      message: 'Please wait before requesting another code',
    };
  }
  if (code === 'INSUFFICIENT_BALANCE' || status === 402) {
    return {
      status: 503,
      code: 'SERVICE_UNAVAILABLE',
      message: 'OTP provider balance is insufficient',
    };
  }
  if (code === 'OTP_EXPIRED') {
    return { status: 401, code: 'UNAUTHORIZED', message: 'OTP has expired' };
  }
  if (code === 'NO_OTP_FOUND') {
    return { status: 401, code: 'UNAUTHORIZED', message: 'OTP is invalid' };
  }
  if (code === 'ALREADY_VERIFIED') {
    return { status: 401, code: 'UNAUTHORIZED', message: 'OTP has already been used' };
  }
  if (code === 'INVALID_OTP') {
    return { status: 401, code: 'UNAUTHORIZED', message: 'OTP is invalid' };
  }
  if (status === 401 || status === 403) {
    return {
      status: 503,
      code: 'SERVICE_UNAVAILABLE',
      message: 'OTP provider authentication failed',
    };
  }
  if (status >= 500) {
    return {
      status: 503,
      code: 'SERVICE_UNAVAILABLE',
      message: 'OTP provider server error',
    };
  }
  if (status >= 400) {
    return {
      status: 503,
      code: 'SERVICE_UNAVAILABLE',
      message: 'OTP provider rejected the request',
    };
  }
  return {
    status: 503,
    code: 'SERVICE_UNAVAILABLE',
    message: 'OTP provider request failed',
  };
}

function readErrorCode(parsed: unknown): string | undefined {
  if (!parsed || typeof parsed !== 'object') return undefined;
  const record = parsed as Record<string, unknown>;
  for (const key of ['code', 'error_code', 'errorCode', 'error']) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim().toUpperCase();
  }
  return undefined;
}

/**
 * Vynfy OTP product adapter.
 *
 * POST /otp/generate — Vynfy creates and delivers the code (not returned in the response).
 * POST /otp/verify — confirms the code the user typed.
 */
export class VynfyOtpProvider implements PhoneOtpProvider {
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly generateUrl: string;
  private readonly verifyUrl: string;

  constructor(private readonly options: VynfyOtpProviderOptions) {
    if (!options.apiKey.trim()) {
      throw new AppError({
        status: 503,
        code: 'SERVICE_UNAVAILABLE',
        message: 'Vynfy OTP API key is not configured',
      });
    }
    if (!options.senderId.trim()) {
      throw new AppError({
        status: 503,
        code: 'SERVICE_UNAVAILABLE',
        message: 'Vynfy OTP sender ID is not configured',
      });
    }
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? VYNFY_OTP_TIMEOUT_MS;
    this.generateUrl = options.generateUrl ?? VYNFY_OTP_GENERATE_URL;
    this.verifyUrl = options.verifyUrl ?? VYNFY_OTP_VERIFY_URL;
  }

  describe() {
    return { configured: true, adapter: 'vynfy-otp', ready: true, mode: 'remote' as const };
  }

  async request(input: PhoneOtpRequestInput): Promise<PhoneOtpRequestResult> {
    const number = normalizeGhanaRecipientForVynfy(input.phoneNumber);
    const expiry = Math.max(1, Math.min(60, Math.round(input.expiryMinutes)));
    const length = Math.max(4, Math.min(8, Math.round(input.length)));
    const payload = {
      number,
      sender_id: this.options.senderId,
      medium: 'sms',
      otp_type: 'numeric',
      length,
      expiry,
      message: buildMessage(expiry),
    };

    const { response, parsed } = await this.postJson(this.generateUrl, payload, input.phoneNumber, 'generate');

    if (!response.ok) {
      const mapped = safeOtpProviderError(response.status, readErrorCode(parsed));
      throw new AppError(mapped);
    }

    const otpId =
      parsed && typeof parsed === 'object' && 'otp_id' in parsed
        ? String((parsed as { otp_id: unknown }).otp_id)
        : '';

    logger.info(
      {
        to: maskPhone(input.phoneNumber),
        adapter: 'vynfy-otp',
        httpStatus: response.status,
        otpIdPresent: otpId.length > 0,
      },
      'Vynfy OTP generate accepted',
    );

    return { mode: 'remote', providerOtpId: otpId || 'unknown' };
  }

  async verifyRemote(input: { phoneNumber: string; code: string }): Promise<void> {
    const number = normalizeGhanaRecipientForVynfy(input.phoneNumber);
    const code = input.code.trim();
    if (!code) {
      throw new AppError({
        status: 401,
        code: 'UNAUTHORIZED',
        message: 'OTP is invalid',
      });
    }

    const { response, parsed } = await this.postJson(
      this.verifyUrl,
      { number, code },
      input.phoneNumber,
      'verify',
    );

    if (!response.ok) {
      const mapped = safeOtpProviderError(response.status, readErrorCode(parsed));
      throw new AppError(mapped);
    }

    logger.info(
      {
        to: maskPhone(input.phoneNumber),
        adapter: 'vynfy-otp',
        httpStatus: response.status,
      },
      'Vynfy OTP verify accepted',
    );
  }

  private async postJson(
    url: string,
    body: Record<string, unknown>,
    phoneNumber: string,
    operation: 'generate' | 'verify',
  ): Promise<{ response: Response; parsed: unknown }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': this.options.apiKey,
        },
        body: JSON.stringify(body),
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
          to: maskPhone(phoneNumber),
          adapter: 'vynfy-otp',
          operation,
          reason: aborted ? 'timeout' : 'network_error',
        },
        'Vynfy OTP request failed before a usable response',
      );
      throw new AppError({
        status: 503,
        code: 'SERVICE_UNAVAILABLE',
        message: aborted
          ? 'OTP provider request timed out; delivery status is ambiguous'
          : 'OTP provider network error',
      });
    } finally {
      clearTimeout(timer);
    }

    let parsed: unknown = null;
    try {
      const text = await response.text();
      if (text.trim()) parsed = JSON.parse(text) as unknown;
    } catch {
      parsed = null;
    }

    if (!response.ok) {
      logger.warn(
        {
          to: maskPhone(phoneNumber),
          adapter: 'vynfy-otp',
          operation,
          httpStatus: response.status,
          providerCode: readErrorCode(parsed) ?? null,
        },
        'Vynfy OTP API rejected the request',
      );
    }

    return { response, parsed };
  }
}
