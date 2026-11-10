import { describe, expect, it } from 'vitest';

import { parseStaticOtpLogins, staticOtpForPhone } from './static-otp.js';

describe('static OTP allowlist', () => {
  it('parses phone:code pairs and ignores junk', () => {
    const map = parseStaticOtpLogins(
      '+233555010001:246810, bad, +233555010002:135790, +15551234567:111111, +233555010003:12',
    );
    expect(map.get('+233555010001')).toBe('246810');
    expect(map.get('+233555010002')).toBe('135790');
    expect(map.has('+233555010003')).toBe(false);
    expect(map.has('+15551234567')).toBe(false);
  });

  it('returns null for numbers not on the allowlist', () => {
    expect(staticOtpForPhone('+233244000000', '+233555010001:246810')).toBeNull();
    expect(staticOtpForPhone('+233555010001', '+233555010001:246810')).toBe('246810');
    expect(staticOtpForPhone('+233555010001', '')).toBeNull();
  });
});
