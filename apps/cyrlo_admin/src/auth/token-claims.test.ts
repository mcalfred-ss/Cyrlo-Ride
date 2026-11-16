import { describe, expect, it } from 'vitest';

import { fakeJwt, privilegedAccessToken } from '../test/jwt';
import { hasPrivilegedMfaAssurance } from './token-claims';

describe('hasPrivilegedMfaAssurance', () => {
  it('accepts MFA access tokens', () => {
    expect(hasPrivilegedMfaAssurance(privilegedAccessToken())).toBe(true);
  });

  it('rejects tokens without mfa claim (refresh-shaped)', () => {
    const token = fakeJwt({
      sub: '11111111-1111-1111-1111-111111111111',
      role: 'ADMIN',
      purpose: 'access',
      exp: Math.floor(Date.now() / 1000) + 900,
    });
    expect(hasPrivilegedMfaAssurance(token)).toBe(false);
  });

  it('rejects expired tokens', () => {
    expect(
      hasPrivilegedMfaAssurance(
        privilegedAccessToken({ exp: Math.floor(Date.now() / 1000) - 10 }),
      ),
    ).toBe(false);
  });

  it('rejects null', () => {
    expect(hasPrivilegedMfaAssurance(null)).toBe(false);
  });
});
