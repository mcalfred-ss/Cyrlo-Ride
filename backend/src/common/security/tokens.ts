import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

import jwt from 'jsonwebtoken';

import { AppError } from '../errors/app-error.js';
import { isStaffRole, type StaffRole } from '../types/staff-roles.js';
import { isUserRole, type UserRole } from '../types/roles.js';

/** Access tokens are always HS256. Never trust a client-selected algorithm. */
export const ACCESS_TOKEN_ALGORITHM = 'HS256' as const;

export type TokenPurpose = 'access' | 'admin_mfa_pending' | 'admin_mfa_enrollment';

export interface AccessTokenClaims {
  sub: string;
  role: UserRole;
  /** Informational only. Privileged routes reload grants from the database. */
  staffRole?: StaffRole;
  /** True only after TOTP/recovery verification for staff sessions. */
  mfa?: boolean;
  /** Unix seconds when MFA was verified for this session. */
  mfaAt?: number;
  purpose?: TokenPurpose;
}

export interface AccessTokenOptions {
  issuer: string;
  audience: string;
}

export function signAccessToken(
  claims: AccessTokenClaims,
  secret: string,
  ttlSeconds: number,
  options: AccessTokenOptions,
): string {
  const payload: Record<string, unknown> = {
    role: claims.role,
    purpose: claims.purpose ?? 'access',
  };
  if (claims.staffRole) payload.staffRole = claims.staffRole;
  if (claims.mfa !== undefined) payload.mfa = claims.mfa;
  if (claims.mfaAt !== undefined) payload.mfaAt = claims.mfaAt;

  return jwt.sign(payload, secret, {
    algorithm: ACCESS_TOKEN_ALGORITHM,
    subject: claims.sub,
    expiresIn: ttlSeconds,
    issuer: options.issuer,
    audience: options.audience,
  });
}

export function verifyAccessToken(
  token: string,
  secret: string,
  options: AccessTokenOptions,
): AccessTokenClaims {
  try {
    const decoded = jwt.verify(token, secret, {
      algorithms: [ACCESS_TOKEN_ALGORITHM],
      issuer: options.issuer,
      audience: options.audience,
    });
    if (typeof decoded !== 'object' || decoded === null) {
      throw new Error('invalid token payload');
    }
    const sub = 'sub' in decoded ? decoded.sub : undefined;
    const role = 'role' in decoded ? decoded.role : undefined;
    if (typeof sub !== 'string' || !isUserRole(role)) {
      throw new Error('invalid token claims');
    }

    const purposeRaw = 'purpose' in decoded ? decoded.purpose : 'access';
    const purpose =
      purposeRaw === 'admin_mfa_pending' ||
      purposeRaw === 'admin_mfa_enrollment' ||
      purposeRaw === 'access'
        ? purposeRaw
        : undefined;
    if (!purpose) throw new Error('invalid token purpose');

    const staffRoleRaw = 'staffRole' in decoded ? decoded.staffRole : undefined;
    const staffRole = staffRoleRaw === undefined ? undefined : staffRoleRaw;
    if (staffRole !== undefined && !isStaffRole(staffRole)) {
      throw new Error('invalid staff role claim');
    }

    const mfa = 'mfa' in decoded && decoded.mfa === true ? true : undefined;
    const mfaAt =
      'mfaAt' in decoded && typeof decoded.mfaAt === 'number' ? decoded.mfaAt : undefined;

    return {
      sub,
      role,
      ...(staffRole ? { staffRole } : {}),
      ...(mfa ? { mfa } : {}),
      ...(mfaAt !== undefined ? { mfaAt } : {}),
      purpose,
    };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError({
      status: 401,
      code: 'UNAUTHORIZED',
      message: 'Access token is invalid or expired',
    });
  }
}

export function createRefreshToken(): string {
  return randomBytes(32).toString('base64url');
}

export function createOpaqueToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function hashSecretValue(value: string, secret: string): string {
  return createHmac('sha256', secret).update(value).digest('hex');
}

export function secretsMatch(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}
