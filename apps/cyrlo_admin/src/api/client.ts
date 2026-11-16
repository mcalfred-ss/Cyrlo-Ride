import { env } from '../config/env';
import { clearMemorySession, getAccessToken } from '../auth/session-store';
import { ApiError, type ApiErrorBody, type ApiSuccess } from './types';

export type UnauthorizedHandler = () => void;

let onUnauthorized: UnauthorizedHandler | null = null;

export function setUnauthorizedHandler(handler: UnauthorizedHandler | null): void {
  onUnauthorized = handler;
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  /** Override bearer token (enrollment / pending MFA tokens). */
  accessToken?: string | null;
  /** When false, do not attach the in-memory privileged access token. */
  auth?: boolean;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  if (!env.apiBaseUrl) {
    throw new ApiError(500, 'CONFIG_ERROR', 'VITE_API_BASE_URL is not configured');
  }

  const headers: Record<string, string> = {
    Accept: 'application/json',
  };

  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  const useAuth = options.auth !== false;
  const token =
    options.accessToken !== undefined
      ? options.accessToken
      : useAuth
        ? getAccessToken()
        : null;
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  let response: Response;
  try {
    response = await fetch(`${env.apiBaseUrl}${path}`, {
      method: options.method ?? (options.body !== undefined ? 'POST' : 'GET'),
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    throw new ApiError(
      0,
      'NETWORK_ERROR',
      `Cannot reach API at ${env.apiBaseUrl}. Is the Ride backend running?`,
    );
  }

  let payload: unknown = null;
  const text = await response.text();
  if (text) {
    try {
      payload = JSON.parse(text) as unknown;
    } catch {
      throw new ApiError(response.status, 'INVALID_JSON', 'Response was not valid JSON');
    }
  }

  if (!response.ok) {
    const err = payload as ApiErrorBody | null;
    const code = err?.error?.code ?? 'HTTP_ERROR';
    const message = err?.error?.message ?? `Request failed (${response.status})`;
    // Only privileged-session 401s expire MFA. Public auth failures (OTP/MFA challenge)
    // also return 401 and must not force the session-expired screen.
    const usedPrivilegedAccessToken =
      useAuth && options.accessToken === undefined && Boolean(token);
    if (response.status === 401 && usedPrivilegedAccessToken) {
      clearMemorySession();
      onUnauthorized?.();
    }
    throw new ApiError(response.status, code, message, err?.error?.details);
  }

  const success = payload as ApiSuccess<T> | null;
  if (!success || success.success !== true) {
    throw new ApiError(response.status, 'INVALID_RESPONSE', 'Unexpected success envelope');
  }
  return success.data;
}
