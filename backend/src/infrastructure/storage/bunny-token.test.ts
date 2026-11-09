import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { signBunnyCdnFileUrl } from './bunny-token.js';

describe('signBunnyCdnFileUrl', () => {
  it('matches Bunny Advanced HS256 query-string signing for a plain file URL', () => {
    const securityKey = 'SecurityKey';
    const path = '/300kb.jpg';
    const expires = 1598024587;

    const digest = createHmac('sha256', securityKey)
      .update(path)
      .update(String(expires))
      .update(Buffer.alloc(0))
      .update('')
      .digest('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    const expected = `https://token-tester.b-cdn.net${path}?token=HS256-${digest}&expires=${expires}`;
    const actual = signBunnyCdnFileUrl({
      cdnBaseUrl: 'https://token-tester.b-cdn.net/',
      storageKey: '300kb.jpg',
      securityKey,
      expiresAtUnixSeconds: expires,
    });
    expect(actual).toBe(expected);
    expect(actual.includes('HS256-1-')).toBe(false);
  });

  it('prefixes storage keys with a leading slash', () => {
    const url = signBunnyCdnFileUrl({
      cdnBaseUrl: 'https://cdn.example',
      storageKey: 'riders/a/doc/file.jpg',
      securityKey: 'k',
      expiresAtUnixSeconds: 100,
    });
    expect(url.startsWith('https://cdn.example/riders/a/doc/file.jpg?token=HS256-')).toBe(true);
    expect(url.endsWith('&expires=100')).toBe(true);
  });
});
