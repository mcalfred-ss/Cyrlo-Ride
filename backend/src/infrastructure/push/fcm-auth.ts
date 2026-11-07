import { GoogleAuth, type JWT, type JWTInput } from 'google-auth-library';

import { logger } from '../../config/logger.js';
import type { FcmServiceAccount } from './fcm-credentials.js';

export const FCM_MESSAGING_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';

export interface FcmAccessTokenProvider {
  getAccessToken(): Promise<string>;
  /** Test/ops hook — clears cached token forcing refresh. */
  invalidate?(): void;
}

/**
 * OAuth access tokens for FCM HTTP v1 via google-auth-library.
 * Tokens are cached in memory only (never persisted to the database).
 * Concurrent callers share a single in-flight refresh promise.
 */
export class GoogleFcmAccessTokenProvider implements FcmAccessTokenProvider {
  private readonly auth: GoogleAuth;
  private cached: { token: string; expiresAtMs: number } | null = null;
  private inflight: Promise<string> | null = null;
  /** Refresh this many ms before expiry. */
  private readonly skewMs: number;

  constructor(
    serviceAccount: FcmServiceAccount,
    options?: { skewMs?: number; auth?: GoogleAuth },
  ) {
    this.skewMs = options?.skewMs ?? 60_000;
    // JWTInput typings omit token_uri in some google-auth-library versions; runtime accepts it.
    const credentials = {
      type: serviceAccount.type,
      project_id: serviceAccount.project_id,
      private_key_id: serviceAccount.private_key_id,
      private_key: serviceAccount.private_key,
      client_email: serviceAccount.client_email,
      client_id: serviceAccount.client_id,
      token_uri: serviceAccount.token_uri ?? 'https://oauth2.googleapis.com/token',
    } as JWTInput;
    this.auth =
      options?.auth ??
      new GoogleAuth({
        credentials,
        scopes: [FCM_MESSAGING_SCOPE],
      });
  }

  invalidate(): void {
    this.cached = null;
  }

  async getAccessToken(): Promise<string> {
    const now = Date.now();
    if (this.cached && this.cached.expiresAtMs - this.skewMs > now) {
      return this.cached.token;
    }
    if (this.inflight) {
      return this.inflight;
    }
    this.inflight = this.refresh(now).finally(() => {
      this.inflight = null;
    });
    return this.inflight;
  }

  private async refresh(nowMs: number): Promise<string> {
    try {
      const client = (await this.auth.getClient()) as JWT;
      const result = await client.getAccessToken();
      const token = typeof result === 'string' ? result : result?.token;
      if (!token) {
        throw new Error('Google auth returned an empty access token');
      }
      // google-auth-library typically expires in ~3600s; prefer credentials.expiry_date when present.
      const expiryFromCreds =
        typeof client.credentials?.expiry_date === 'number'
          ? client.credentials.expiry_date
          : nowMs + 3_500_000;
      this.cached = { token, expiresAtMs: expiryFromCreds };
      return token;
    } catch (error) {
      logger.warn(
        { err: sanitizeAuthError(error) },
        'FCM OAuth access token acquisition failed',
      );
      throw error;
    }
  }
}

function sanitizeAuthError(error: unknown): { name?: string; message: string } {
  if (!(error instanceof Error)) {
    return { message: 'auth_error' };
  }
  // Strip any accidental credential material from messages.
  const message = error.message
    .replace(/-----BEGIN[\s\S]*?PRIVATE KEY-----/g, '[redacted-key]')
    .replace(/ya29\.[A-Za-z0-9._-]+/g, '[redacted-token]');
  return { name: error.name, message };
}
