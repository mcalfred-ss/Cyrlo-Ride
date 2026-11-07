import { AppError } from '../../common/errors/app-error.js';
import { logger } from '../../config/logger.js';
import { GoogleFcmAccessTokenProvider } from './fcm-auth.js';
import { loadFcmServiceAccountFile } from './fcm-credentials.js';
import { FcmHttpV1PushProvider } from './fcm-http-v1.js';

export interface PushMessage {
  title: string;
  body: string;
  /** Safe string data only — no secrets, OTP, Ghana Card, or precise GPS. */
  data?: Record<string, string>;
}

export type PushSendResult =
  | { outcome: 'sent' }
  | { outcome: 'invalid_token'; code: string; message: string }
  | { outcome: 'retryable'; code: string; message: string }
  | { outcome: 'failed'; code: string; message: string };

export interface PushProviderStatus {
  configured: boolean;
  adapter: string;
  ready: boolean;
  projectId?: string;
  iosPath?: string;
}

export interface PushProvider {
  sendToToken(input: {
    token: string;
    platform: 'ANDROID' | 'IOS' | 'WEB';
    message: PushMessage;
  }): Promise<PushSendResult>;
  describe?(): PushProviderStatus;
}

export class UnconfiguredPushProvider implements PushProvider {
  constructor(
    private readonly reason = 'Push provider is not configured. Set PUSH_PROVIDER=fcm with FCM_PROJECT_ID and FCM_SERVICE_ACCOUNT_FILE.',
  ) {}

  async sendToToken(): Promise<PushSendResult> {
    return {
      outcome: 'failed',
      code: 'NOT_CONFIGURED',
      message: this.reason,
    };
  }

  describe(): PushProviderStatus {
    return { configured: false, adapter: 'none', ready: false };
  }
}

/** Test/dev provider. Never logs payload bodies beyond title length. */
export class MemoryPushProvider implements PushProvider {
  readonly sent: Array<{ token: string; platform: string; title: string }> = [];
  invalidTokens = new Set<string>();
  nextResult: PushSendResult | null = null;

  async sendToToken(input: {
    token: string;
    platform: 'ANDROID' | 'IOS' | 'WEB';
    message: PushMessage;
  }): Promise<PushSendResult> {
    if (this.nextResult) {
      const result = this.nextResult;
      this.nextResult = null;
      return result;
    }
    if (this.invalidTokens.has(input.token)) {
      return { outcome: 'invalid_token', code: 'UNREGISTERED', message: 'token unregistered' };
    }
    this.sent.push({
      token: input.token,
      platform: input.platform,
      title: input.message.title,
    });
    return { outcome: 'sent' };
  }

  describe(): PushProviderStatus {
    return { configured: true, adapter: 'memory', ready: true };
  }
}

/**
 * @deprecated Legacy FCM HTTP API using a server key.
 * Prefer FcmHttpV1PushProvider. Kept only as an explicit migration bridge
 * when PUSH_PROVIDER=fcm-legacy and PUSH_API_KEY are set.
 */
export class FcmHttpPushProvider implements PushProvider {
  constructor(private readonly serverKey: string) {}

  describe(): PushProviderStatus {
    return {
      configured: true,
      adapter: 'fcm-legacy-http',
      ready: Boolean(this.serverKey),
      iosPath: 'fcm-apns',
    };
  }

  async sendToToken(input: {
    token: string;
    platform: 'ANDROID' | 'IOS' | 'WEB';
    message: PushMessage;
  }): Promise<PushSendResult> {
    if (!this.serverKey) {
      return {
        outcome: 'failed',
        code: 'NOT_CONFIGURED',
        message: 'FCM server key missing',
      };
    }
    try {
      const response = await fetch('https://fcm.googleapis.com/fcm/send', {
        method: 'POST',
        headers: {
          Authorization: `key=${this.serverKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: input.token,
          notification: {
            title: input.message.title,
            body: input.message.body,
          },
          data: input.message.data ?? {},
          priority: 'high',
        }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        success?: number;
        failure?: number;
        results?: Array<{ error?: string; message_id?: string }>;
      };
      if (!response.ok) {
        const retryable = response.status === 429 || response.status >= 500;
        return {
          outcome: retryable ? 'retryable' : 'failed',
          code: `HTTP_${response.status}`,
          message: 'FCM HTTP error',
        };
      }
      const error = body.results?.[0]?.error;
      if (error === 'NotRegistered' || error === 'InvalidRegistration') {
        return { outcome: 'invalid_token', code: error, message: error };
      }
      if (error) {
        const retryable = error === 'Unavailable' || error === 'InternalServerError';
        return {
          outcome: retryable ? 'retryable' : 'failed',
          code: error,
          message: error,
        };
      }
      return { outcome: 'sent' };
    } catch (error) {
      logger.warn({ err: error }, 'FCM legacy send network failure');
      return {
        outcome: 'retryable',
        code: 'NETWORK',
        message: error instanceof Error ? error.message : 'network_error',
      };
    }
  }
}

export interface CreatePushProviderOptions {
  provider: string;
  nodeEnv: string;
  /** Deprecated server key — only for PUSH_PROVIDER=fcm-legacy. */
  apiKey?: string;
  projectId?: string;
  serviceAccountFile?: string;
  /** Test injection for FCM HTTP v1. */
  fetchImpl?: typeof fetch;
  tokenProvider?: import('./fcm-auth.js').FcmAccessTokenProvider;
}

/**
 * Resolves the push adapter.
 *
 * - `fcm` + project id + service account file → FCM HTTP v1 (Android + iOS via Firebase APNs)
 * - `fcm-legacy` + PUSH_API_KEY → legacy HTTP (deprecated bridge)
 * - Production without credentials → UnconfiguredPushProvider (fail closed on send)
 * - Non-production without credentials → MemoryPushProvider
 */
export function createPushProvider(options: CreatePushProviderOptions): PushProvider {
  const name = options.provider.trim().toLowerCase();

  if (name === 'fcm' || name === 'firebase') {
    const projectId = (options.projectId ?? '').trim();
    const filePath = (options.serviceAccountFile ?? '').trim();
    if (projectId && filePath) {
      try {
        const account = loadFcmServiceAccountFile(filePath);
        if (account.project_id !== projectId) {
          logger.warn(
            {
              envProjectId: projectId,
              fileProjectId: account.project_id,
            },
            'FCM_PROJECT_ID does not match service account project_id; using env project id for endpoint',
          );
        }
        const tokenProvider =
          options.tokenProvider ?? new GoogleFcmAccessTokenProvider(account);
        return new FcmHttpV1PushProvider({
          projectId,
          tokenProvider,
          fetchImpl: options.fetchImpl,
        });
      } catch (error) {
        logger.error(
          {
            err: error instanceof Error ? { message: error.message } : error,
          },
          'FCM HTTP v1 provider failed to initialize',
        );
        return new UnconfiguredPushProvider(
          error instanceof Error ? error.message : 'FCM HTTP v1 initialization failed',
        );
      }
    }

    // Explicitly do not silently fall back to legacy server key for PUSH_PROVIDER=fcm.
    if ((options.apiKey ?? '').trim()) {
      logger.warn(
        'PUSH_API_KEY is set but FCM HTTP v1 requires FCM_PROJECT_ID + FCM_SERVICE_ACCOUNT_FILE. Use PUSH_PROVIDER=fcm-legacy only as a temporary bridge.',
      );
    }
    if (options.nodeEnv === 'production') {
      return new UnconfiguredPushProvider();
    }
    return new MemoryPushProvider();
  }

  if (name === 'fcm-legacy') {
    const key = (options.apiKey ?? '').trim();
    if (key) {
      logger.warn('Using deprecated FCM legacy HTTP API (PUSH_PROVIDER=fcm-legacy)');
      return new FcmHttpPushProvider(key);
    }
  }

  if (name && (options.apiKey ?? '').trim()) {
    return new UnconfiguredPushProvider(
      `Push provider "${name}" is not supported. Use PUSH_PROVIDER=fcm with FCM HTTP v1 credentials.`,
    );
  }

  if (options.nodeEnv === 'production') {
    return new UnconfiguredPushProvider();
  }
  return new MemoryPushProvider();
}

export function describePushProvider(provider: PushProvider): PushProviderStatus {
  if (typeof provider.describe === 'function') {
    return provider.describe();
  }
  return { configured: false, adapter: 'unknown', ready: false };
}

export function assertPushConfiguredForProduction(provider: PushProvider): void {
  if (provider instanceof UnconfiguredPushProvider) {
    throw new AppError({
      status: 503,
      code: 'SERVICE_UNAVAILABLE',
      message: 'Push provider is not configured',
    });
  }
}
