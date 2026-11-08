import { randomBytes } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  encryptionKeyErrorMessage,
  inspectEncryptionKey,
} from './encryption-keys.js';

describe('inspectEncryptionKey', () => {
  it('accepts a random 32-byte key', () => {
    const key = randomBytes(32).toString('base64');
    expect(inspectEncryptionKey(key)).toEqual({ ok: true });
  });

  it('rejects missing keys', () => {
    expect(inspectEncryptionKey('')).toMatchObject({ ok: false, issue: 'missing' });
    expect(inspectEncryptionKey(undefined)).toMatchObject({ ok: false, issue: 'missing' });
  });

  it('rejects wrong length', () => {
    expect(inspectEncryptionKey(Buffer.alloc(16).toString('base64'))).toMatchObject({
      ok: false,
      issue: 'wrong_length',
    });
  });

  it('rejects published example keys without echoing the secret', () => {
    const example = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';
    const result = inspectEncryptionKey(example);
    expect(result.ok).toBe(false);
    expect(result.issue).toBe('example_key');
    const message = encryptionKeyErrorMessage('ADMIN_MFA_ENCRYPTION_KEY', result.issue!);
    expect(message).toContain('ADMIN_MFA_ENCRYPTION_KEY');
    expect(message).not.toContain(example);
    expect(JSON.stringify(result)).not.toContain(example);
  });

  it('rejects the identity example key and all-identical weak material', () => {
    expect(
      inspectEncryptionKey('AgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgI='),
    ).toMatchObject({ ok: false, issue: 'example_key' });
    expect(inspectEncryptionKey(Buffer.alloc(32, 7).toString('base64'))).toMatchObject({
      ok: false,
      issue: 'weak_key',
    });
  });
});
