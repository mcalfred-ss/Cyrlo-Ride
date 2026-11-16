import { ApiError } from '../api/types';

export const RECENT_MFA_MESSAGE =
  'Recent MFA verification is required — sign out and complete MFA again.';

export function isRecentMfaError(err: unknown): boolean {
  return err instanceof ApiError && err.status === 403 && /recent mfa/i.test(err.message);
}

/** Human-readable message for an API/network failure (maps recent-MFA 403s). */
export function errorMessage(err: unknown, fallback = 'Request failed'): string {
  if (isRecentMfaError(err)) return RECENT_MFA_MESSAGE;
  if (err instanceof Error) return err.message || fallback;
  return fallback;
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseEnum<T extends string>(
  value: string | null,
  allowed: readonly T[],
): T | undefined {
  if (!value) return undefined;
  return (allowed as readonly string[]).includes(value) ? (value as T) : undefined;
}

export function parsePage(value: string | null): number {
  const n = Number(value || '1');
  return Number.isInteger(n) && n > 0 ? n : 1;
}

export function parseIsoDatetime(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  return Number.isNaN(new Date(trimmed).getTime()) ? undefined : trimmed;
}
