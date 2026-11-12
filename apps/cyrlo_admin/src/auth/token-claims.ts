import type { StaffRole } from '../config/permissions';

export interface AccessTokenClaims {
  sub?: string;
  role?: string;
  staffRole?: StaffRole;
  mfa?: boolean;
  mfaAt?: number;
  purpose?: string;
  exp?: number;
}

/** Decode JWT payload without verifying signature (UX only — never trust for authz). */
export function decodeAccessTokenClaims(token: string): AccessTokenClaims | null {
  const parts = token.split('.');
  if (parts.length < 2 || !parts[1]) return null;
  try {
    const json = atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(json) as AccessTokenClaims;
  } catch {
    return null;
  }
}

/** Privileged admin session requires MFA claim on the access token. */
export function hasPrivilegedMfaAssurance(token: string | null): boolean {
  if (!token) return false;
  const claims = decodeAccessTokenClaims(token);
  if (!claims) return false;
  if (claims.role !== 'ADMIN') return false;
  if (claims.purpose !== undefined && claims.purpose !== 'access') return false;
  if (claims.mfa !== true) return false;
  if (typeof claims.exp === 'number' && claims.exp * 1000 <= Date.now()) return false;
  return true;
}

export function accessTokenExpiresAtMs(token: string): number | null {
  const claims = decodeAccessTokenClaims(token);
  if (!claims?.exp) return null;
  return claims.exp * 1000;
}
