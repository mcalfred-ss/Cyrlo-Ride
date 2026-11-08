/**
 * Production guards for AES-256-GCM application encryption keys.
 * Never log or return the raw key material from these helpers.
 */

/** Known .env.example / documentation sample keys (base64 of repeating bytes). */
const KNOWN_EXAMPLE_KEYS = new Set([
  // 32× 0x00 — .env.example ADMIN_MFA_ENCRYPTION_KEY
  'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
  // 32× 0x02 — .env.example IDENTITY_ENCRYPTION_KEY
  'AgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgI=',
]);

export type EncryptionKeyIssue =
  | 'missing'
  | 'invalid_base64'
  | 'wrong_length'
  | 'example_key'
  | 'weak_key';

export function inspectEncryptionKey(keyBase64: string | undefined): {
  ok: boolean;
  issue?: EncryptionKeyIssue;
  /** Safe label only — never the key value. */
  detail?: string;
} {
  if (keyBase64 == null || keyBase64.trim().length === 0) {
    return { ok: false, issue: 'missing', detail: 'key is required' };
  }
  const trimmed = keyBase64.trim();
  let decoded: Buffer;
  try {
    decoded = Buffer.from(trimmed, 'base64');
  } catch {
    return { ok: false, issue: 'invalid_base64', detail: 'key must be valid base64' };
  }
  // Buffer.from with base64 is lenient; reject if round-trip loses information for common cases
  // or length is wrong.
  if (decoded.length !== 32) {
    return {
      ok: false,
      issue: 'wrong_length',
      detail: 'key must decode to exactly 32 bytes',
    };
  }
  if (KNOWN_EXAMPLE_KEYS.has(trimmed) || isKnownExampleDecoded(decoded)) {
    return {
      ok: false,
      issue: 'example_key',
      detail: 'key matches a published example and must be replaced',
    };
  }
  if (isWeakKeyMaterial(decoded)) {
    return {
      ok: false,
      issue: 'weak_key',
      detail: 'key material is too weak (low entropy)',
    };
  }
  return { ok: true };
}

function isKnownExampleDecoded(decoded: Buffer): boolean {
  // All 0x00 or all 0x02 as shipped in .env.example historically.
  return decoded.every((b) => b === 0x00) || decoded.every((b) => b === 0x02);
}

function isWeakKeyMaterial(decoded: Buffer): boolean {
  if (decoded.every((b) => b === decoded[0])) return true;
  // Fewer than 8 distinct byte values in 32 bytes is suspiciously low entropy.
  const distinct = new Set(decoded);
  return distinct.size < 8;
}

/** Human-readable validation message that never includes the secret value. */
export function encryptionKeyErrorMessage(keyName: string, issue: EncryptionKeyIssue): string {
  switch (issue) {
    case 'missing':
      return `${keyName} is required`;
    case 'invalid_base64':
      return `${keyName} must be valid base64`;
    case 'wrong_length':
      return `${keyName} must decode to exactly 32 bytes`;
    case 'example_key':
      return `${keyName} still uses a published example key`;
    case 'weak_key':
      return `${keyName} is too weak; generate a fresh 32-byte key`;
    default:
      return `${keyName} is invalid`;
  }
}
