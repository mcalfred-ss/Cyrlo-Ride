import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

import { AppError } from '../errors/app-error.js';

const VERSION = 1;

/**
 * AES-256-GCM envelope for secrets that must not sit in Postgres as plaintext.
 * Key material comes from env (ADMIN_MFA_ENCRYPTION_KEY), never from the database.
 */
export function encryptSecret(plaintext: string, keyBase64: string): string {
  const key = decodeKey(keyBase64);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    `v${VERSION}`,
    iv.toString('base64url'),
    tag.toString('base64url'),
    ciphertext.toString('base64url'),
  ].join('.');
}

export function decryptSecret(payload: string, keyBase64: string): string {
  const key = decodeKey(keyBase64);
  const parts = payload.split('.');
  if (parts.length !== 4 || parts[0] !== `v${VERSION}`) {
    throw new AppError({
      status: 500,
      code: 'INTERNAL_ERROR',
      message: 'Encrypted secret payload is invalid',
    });
  }
  const iv = Buffer.from(parts[1]!, 'base64url');
  const tag = Buffer.from(parts[2]!, 'base64url');
  const ciphertext = Buffer.from(parts[3]!, 'base64url');
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

function decodeKey(keyBase64: string): Buffer {
  const key = Buffer.from(keyBase64, 'base64');
  if (key.length !== 32) {
    throw new AppError({
      status: 500,
      code: 'INTERNAL_ERROR',
      message: 'Encryption key must be 32 bytes encoded as base64',
    });
  }
  return key;
}
