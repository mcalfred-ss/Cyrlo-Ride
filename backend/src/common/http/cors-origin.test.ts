import { describe, expect, it } from 'vitest';

import { isAllowedCorsOrigin, isLocalBrowserOrigin } from './cors-origin.js';

describe('isLocalBrowserOrigin', () => {
  it('accepts localhost and loopback with any port', () => {
    expect(isLocalBrowserOrigin('http://localhost:53521')).toBe(true);
    expect(isLocalBrowserOrigin('http://127.0.0.1:5000')).toBe(true);
    expect(isLocalBrowserOrigin('https://localhost')).toBe(true);
  });

  it('rejects non-local hosts', () => {
    expect(isLocalBrowserOrigin('https://cyrloride.eqostack.com')).toBe(false);
    expect(isLocalBrowserOrigin('http://192.168.1.10:3000')).toBe(false);
  });
});

describe('isAllowedCorsOrigin', () => {
  const allowed = new Set(['https://app.example.com']);

  it('allows missing origin (native clients)', () => {
    expect(isAllowedCorsOrigin(undefined, allowed)).toBe(true);
  });

  it('allows exact allowlist matches', () => {
    expect(isAllowedCorsOrigin('https://app.example.com', allowed)).toBe(true);
  });

  it('allows local browser origins by default', () => {
    expect(isAllowedCorsOrigin('http://localhost:61234', allowed)).toBe(true);
  });

  it('can disable local browser allowance', () => {
    expect(
      isAllowedCorsOrigin('http://localhost:61234', allowed, {
        allowLocalBrowser: false,
      }),
    ).toBe(false);
  });
});
