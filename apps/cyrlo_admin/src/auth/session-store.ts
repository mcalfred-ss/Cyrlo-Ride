/**
 * In-memory session store only.
 * Access tokens are never written to localStorage.
 * Refresh tokens are kept in memory for logout (POST /auth/logout) only —
 * Phase 1A never uses /auth/refresh to restore MFA assurance.
 */

export interface MemorySession {
  accessToken: string;
  refreshToken: string;
}

let session: MemorySession | null = null;

export function getMemorySession(): MemorySession | null {
  return session;
}

export function setMemorySession(next: MemorySession): void {
  session = next;
}

export function clearMemorySession(): void {
  session = null;
}

export function getAccessToken(): string | null {
  return session?.accessToken ?? null;
}

export function getRefreshToken(): string | null {
  return session?.refreshToken ?? null;
}
