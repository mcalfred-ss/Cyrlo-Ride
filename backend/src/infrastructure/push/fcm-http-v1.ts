import { logger } from '../../config/logger.js';
import type { FcmAccessTokenProvider } from './fcm-auth.js';
import type { PushMessage, PushProvider, PushSendResult } from './push.provider.js';

export interface FcmHttpV1Options {
  projectId: string;
  tokenProvider: FcmAccessTokenProvider;
  /** Injectable for tests. Defaults to global fetch. */
  fetchImpl?: typeof fetch;
  /** Request timeout in ms. */
  timeoutMs?: number;
}

/**
 * FCM HTTP v1 sender.
 *
 * iOS uses Firebase's APNs integration (same FCM registration token path as
 * Flutter iOS). There is no separate direct APNs provider in this codebase.
 * `outcome: 'sent'` means FCM accepted the message for delivery — not confirmed
 * device receipt.
 */
export class FcmHttpV1PushProvider implements PushProvider {
  private readonly projectId: string;
  private readonly tokens: FcmAccessTokenProvider;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: FcmHttpV1Options) {
    this.projectId = options.projectId.trim();
    this.tokens = options.tokenProvider;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 15_000;
    if (!this.projectId) {
      throw new Error('FCM project id is required');
    }
  }

  describe() {
    return {
      configured: true,
      adapter: 'fcm-http-v1',
      ready: true,
      projectId: this.projectId,
      iosPath: 'fcm-apns',
    };
  }

  async sendToToken(input: {
    token: string;
    platform: 'ANDROID' | 'IOS' | 'WEB';
    message: PushMessage;
  }): Promise<PushSendResult> {
    if (!input.token.trim()) {
      return {
        outcome: 'failed',
        code: 'INVALID_ARGUMENT',
        message: 'device token is empty',
      };
    }

    let accessToken: string;
    try {
      accessToken = await this.tokens.getAccessToken();
    } catch (error) {
      logger.error(
        { err: error instanceof Error ? { name: error.name, message: error.message } : error },
        'FCM authentication failure',
      );
      return {
        outcome: 'failed',
        code: 'UNAUTHENTICATED',
        message: 'FCM OAuth token acquisition failed',
      };
    }

    const url = `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(this.projectId)}/messages:send`;
    const body = buildFcmV1Message(input);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchImpl(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json; charset=UTF-8',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (response.status === 401) {
        this.tokens.invalidate?.();
      }

      if (response.ok) {
        // Provider acceptance only — not confirmed device delivery.
        return { outcome: 'sent' };
      }

      const payload = (await response.json().catch(() => ({}))) as FcmErrorBody;
      return classifyFcmHttpV1Error(response.status, payload);
    } catch (error) {
      const aborted =
        (error instanceof Error && error.name === 'AbortError') ||
        (typeof error === 'object' &&
          error &&
          'name' in error &&
          (error as { name?: string }).name === 'AbortError');
      logger.warn(
        {
          err: error instanceof Error ? { name: error.name, message: error.message } : error,
          aborted,
        },
        'FCM HTTP v1 network failure',
      );
      return {
        outcome: 'retryable',
        code: aborted ? 'TIMEOUT' : 'NETWORK',
        message: aborted
          ? 'FCM request timed out'
          : error instanceof Error
            ? error.message
            : 'network_error',
      };
    } finally {
      clearTimeout(timer);
    }
  }
}

export function buildFcmV1Message(input: {
  token: string;
  platform: 'ANDROID' | 'IOS' | 'WEB';
  message: PushMessage;
}): { message: Record<string, unknown> } {
  const data = sanitizePushData(input.message.data);
  const message: Record<string, unknown> = {
    token: input.token,
    notification: {
      title: input.message.title,
      body: input.message.body,
    },
    data,
  };

  // Android high priority for time-sensitive trip/matching alerts.
  message.android = {
    priority: 'HIGH',
  };

  // iOS via Firebase APNs bridge — alert + high priority header.
  // Do not invent a separate APNs certificate path here.
  message.apns = {
    headers: {
      'apns-priority': '10',
    },
    payload: {
      aps: {
        alert: {
          title: input.message.title,
          body: input.message.body,
        },
        sound: 'default',
      },
    },
  };

  return { message };
}

interface FcmErrorBody {
  error?: {
    code?: number;
    message?: string;
    status?: string;
    details?: Array<{
      '@type'?: string;
      errorCode?: string;
      fieldViolations?: Array<{ field?: string; description?: string }>;
    }>;
  };
}

export function classifyFcmHttpV1Error(
  httpStatus: number,
  body: FcmErrorBody,
): PushSendResult {
  const status = body.error?.status ?? `HTTP_${httpStatus}`;
  const detailCode = extractFcmErrorCode(body);
  const message = (body.error?.message ?? status).slice(0, 200);
  const code = detailCode ?? status;

  if (
    code === 'UNREGISTERED' ||
    code === 'NOT_FOUND' ||
    httpStatus === 404 ||
    (code === 'INVALID_ARGUMENT' && isLikelyInvalidToken(body, message))
  ) {
    return { outcome: 'invalid_token', code, message };
  }

  if (code === 'SENDER_ID_MISMATCH') {
    return { outcome: 'invalid_token', code, message };
  }

  if (
    code === 'UNAVAILABLE' ||
    code === 'INTERNAL' ||
    code === 'RESOURCE_EXHAUSTED' ||
    code === 'QUOTA_EXCEEDED' ||
    httpStatus === 429 ||
    httpStatus === 503 ||
    httpStatus === 500
  ) {
    return { outcome: 'retryable', code, message };
  }

  if (
    code === 'UNAUTHENTICATED' ||
    code === 'PERMISSION_DENIED' ||
    httpStatus === 401 ||
    httpStatus === 403
  ) {
    // THIRD_PARTY_AUTH_ERROR (bad APNs cert in Firebase) is ops-visible and not a bad device token.
    return { outcome: 'failed', code, message };
  }

  if (code === 'THIRD_PARTY_AUTH_ERROR') {
    return {
      outcome: 'failed',
      code,
      message: 'Firebase APNs / third-party push credentials are invalid or missing',
    };
  }

  if (httpStatus >= 500) {
    return { outcome: 'retryable', code, message };
  }

  return { outcome: 'failed', code, message };
}

function extractFcmErrorCode(body: FcmErrorBody): string | null {
  const details = body.error?.details;
  if (!Array.isArray(details)) return null;
  for (const detail of details) {
    if (typeof detail.errorCode === 'string' && detail.errorCode.length > 0) {
      return detail.errorCode;
    }
  }
  return null;
}

function isLikelyInvalidToken(body: FcmErrorBody, message: string): boolean {
  const lowered = message.toLowerCase();
  if (lowered.includes('registration token') || lowered.includes('not a valid fcm')) {
    return true;
  }
  const details = body.error?.details;
  if (!Array.isArray(details)) return false;
  return details.some((detail) =>
    (detail.fieldViolations ?? []).some(
      (v) =>
        (v.field ?? '').toLowerCase().includes('token') ||
        (v.description ?? '').toLowerCase().includes('token'),
    ),
  );
}

function sanitizePushData(data: Record<string, string> | undefined): Record<string, string> {
  if (!data) return {};
  const blocked = new Set([
    'otp',
    'code',
    'ghanaCard',
    'ghanaCardNumber',
    'secret',
    'password',
    'token',
    'accessToken',
    'refreshToken',
    'authorization',
    'latitude',
    'longitude',
    'coordinates',
  ]);
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(data)) {
    if (blocked.has(key)) continue;
    if (typeof value === 'string') {
      out[key] = value.slice(0, 500);
    }
  }
  return out;
}

export function maskDeviceToken(token: string): string {
  if (token.length < 12) return '***';
  return `${token.slice(0, 6)}…${token.slice(-4)}`;
}
