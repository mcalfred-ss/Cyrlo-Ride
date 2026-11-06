import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

import jwt from 'jsonwebtoken';

import { AppError } from '../errors/app-error.js';
import { isUserRole, type UserRole } from '../types/roles.js';

export interface AccessTokenClaims {
  sub: string;
  role: UserRole;
}

export function signAccessToken(
  claims: AccessTokenClaims,
  secret: string,
  ttlSeconds: number,
): string {
  return jwt.sign({ sub: claims.sub, role: claims.role }, secret, { expiresIn: ttlSeconds });
}

export function verifyAccessToken(token: string, secret: string): AccessTokenClaims {
  try {
    const decoded = jwt.verify(token, secret);
    if (typeof decoded !== 'object' || decoded === null) {
      throw new Error('invalid token payload');
    }
    const sub = 'sub' in decoded ? decoded.sub : undefined;
    const role = 'role' in decoded ? decoded.role : undefined;
    if (typeof sub !== 'string' || !isUserRole(role)) {
      throw new Error('invalid token claims');
    }
    return { sub, role };
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

export function hashSecretValue(value: string, secret: string): string {
  return createHmac('sha256', secret).update(value).digest('hex');
}

export function secretsMatch(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}
