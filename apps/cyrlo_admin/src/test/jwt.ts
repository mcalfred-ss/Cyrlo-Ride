/** Build an unsigned JWT for unit tests (signature not verified by the SPA). */
export function fakeJwt(payload: Record<string, unknown>): string {
  const header = btoa(JSON.stringify({ alg: 'none', typ: 'JWT' }));
  const body = btoa(JSON.stringify(payload));
  return `${header}.${body}.sig`;
}

export function privilegedAccessToken(overrides: Record<string, unknown> = {}): string {
  return fakeJwt({
    sub: '11111111-1111-1111-1111-111111111111',
    role: 'ADMIN',
    staffRole: 'OPERATIONS_ADMIN',
    mfa: true,
    mfaAt: Math.floor(Date.now() / 1000),
    purpose: 'access',
    exp: Math.floor(Date.now() / 1000) + 900,
    ...overrides,
  });
}
