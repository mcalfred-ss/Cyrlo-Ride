import { randomInt } from 'node:crypto';

import { hashSecretValue } from './tokens.js';

export function generateOtpCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

export function hashOtpCode(code: string, secret: string): string {
  return hashSecretValue(code, secret);
}

export function isOtpExpired(expiresAt: Date, now = new Date()): boolean {
  return now.getTime() >= expiresAt.getTime();
}

export function canAttemptOtp(attempts: number, maxAttempts: number): boolean {
  return attempts < maxAttempts;
}
