import { createHash, randomBytes, randomInt } from 'node:crypto';

import * as OTPAuth from 'otpauth';
import QRCode from 'qrcode';

import { hashSecretValue } from './tokens.js';

export function generateTotpSecret(): string {
  return new OTPAuth.Secret({ size: 20 }).base32;
}

export function buildTotp(secretBase32: string, issuer: string, label: string): OTPAuth.TOTP {
  return new OTPAuth.TOTP({
    issuer,
    label,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secretBase32),
  });
}

export function verifyTotpCode(options: {
  secretBase32: string;
  token: string;
  issuer: string;
  label: string;
  epoch?: number;
  window?: number;
}): { valid: boolean; step: number | null } {
  const totp = buildTotp(options.secretBase32, options.issuer, options.label);
  const delta = totp.validate({
    token: options.token,
    window: options.window ?? 1,
    timestamp: options.epoch,
  });
  if (delta === null) return { valid: false, step: null };
  const periodMs = (totp.period ?? 30) * 1000;
  const timestamp = options.epoch ?? Date.now();
  const step = Math.floor(timestamp / periodMs) + delta;
  return { valid: true, step };
}

export function totpOtpauthUrl(secretBase32: string, issuer: string, label: string): string {
  return buildTotp(secretBase32, issuer, label).toString();
}

export async function totpQrDataUrl(otpauthUrl: string): Promise<string> {
  return QRCode.toDataURL(otpauthUrl, { errorCorrectionLevel: 'M', margin: 1, width: 256 });
}

export function generateRecoveryCodes(count = 10): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const left = randomBytes(4).toString('hex');
    const right = randomInt(0, 1_000_000).toString().padStart(6, '0');
    codes.push(`${left}-${right}`);
  }
  return codes;
}

export function hashRecoveryCode(code: string, secret: string): string {
  const normalized = code.trim().toLowerCase();
  return hashSecretValue(normalized, secret);
}

export function fingerprintSecret(secretBase32: string): string {
  return createHash('sha256').update(secretBase32).digest('hex').slice(0, 12);
}
