import { randomUUID } from 'node:crypto';

import jwt from 'jsonwebtoken';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AppError } from '../../common/errors/app-error.js';
import {
  ACCESS_TOKEN_ALGORITHM,
  hashSecretValue,
  signAccessToken,
  verifyAccessToken,
} from '../../common/security/tokens.js';
import { env } from '../../config/env.js';
import { SmsBackedPhoneOtpProvider } from '../../infrastructure/otp/phone-otp.provider.js';
import {
  VYNFY_OTP_GENERATE_URL,
  VYNFY_OTP_VERIFY_URL,
  VynfyOtpProvider,
} from '../../infrastructure/otp/vynfy-otp.provider.js';
import { DevelopmentSmsProvider } from '../../infrastructure/sms/sms.provider.js';
import { MemoryAuthStore } from './memory-auth-store.js';
import { AuthServiceImpl } from './module.service.js';

const phone = '+233244123456';
const tokenOptions = { issuer: env.JWT_ISSUER, audience: env.JWT_AUDIENCE };

function createService(store: MemoryAuthStore, code = '123456', now = new Date('2026-01-01T00:00:00.000Z')) {
  const sms = new DevelopmentSmsProvider();
  const phoneOtp = new SmsBackedPhoneOtpProvider(sms);
  const service = new AuthServiceImpl(store, {
    phoneOtp,
    sms,
    now: () => now,
    generateCode: () => code,
  });
  return { service, sms, phoneOtp, now };
}

describe('OTP authentication', () => {
  let store: MemoryAuthStore;

  beforeEach(() => {
    store = new MemoryAuthStore();
  });

  it('requests an OTP successfully without returning the code by default', async () => {
    const { service, sms } = createService(store);
    const result = await service.requestOtp({ phoneNumber: phone });
    expect(result).toEqual({ expiresIn: 300, resendAfter: 60 });
    expect(result).not.toHaveProperty('developmentCode');
    expect(sms.sent).toHaveLength(1);
    expect(sms.sent[0]?.to).toBe(phone);
    expect(sms.sent[0]?.body).toBe('[redacted]');
    expect(store.otpChallenges).toHaveLength(1);
    expect(store.otpChallenges[0]?.codeHash).not.toContain('123456');
  });

  it('uses a fixed OTP for allowlisted phones and skips SMS', async () => {
    const reviewPhone = '+233555010011';
    const sms = new DevelopmentSmsProvider();
    const service = new AuthServiceImpl(store, {
      phoneOtp: new SmsBackedPhoneOtpProvider(sms),
      sms,
      now: () => new Date('2026-01-01T00:00:00.000Z'),
      generateCode: () => '999999',
      staticOtpFor: (value) => (value === reviewPhone ? '246810' : null),
    });

    await service.requestOtp({ phoneNumber: reviewPhone });
    expect(sms.sent).toHaveLength(0);

    const session = await service.verifyOtp({
      phoneNumber: reviewPhone,
      code: '246810',
      role: 'PASSENGER',
    });
    expect(session.user.phoneNumber).toBe(reviewPhone);
    expect(session.isNewUser).toBe(true);
  });

  it('verifies a valid OTP and establishes a session', async () => {
    const { service } = createService(store);
    await service.requestOtp({ phoneNumber: phone });
    const session = await service.verifyOtp({
      phoneNumber: phone,
      code: '123456',
      role: 'PASSENGER',
    });
    expect(session.accessToken).toBeTruthy();
    expect(session.refreshToken.length).toBeGreaterThanOrEqual(20);
    expect(session.expiresIn).toBe(900);
    expect(session.user).toMatchObject({
      phoneNumber: phone,
      role: 'PASSENGER',
      status: 'ACTIVE',
    });
    const claims = verifyAccessToken(session.accessToken, env.JWT_ACCESS_SECRET, tokenOptions);
    expect(claims.sub).toBe(session.user.id);
    expect(claims.role).toBe('PASSENGER');
  });

  it('rejects an invalid OTP', async () => {
    const { service } = createService(store);
    await service.requestOtp({ phoneNumber: phone });
    await expect(
      service.verifyOtp({ phoneNumber: phone, code: '000000', role: 'PASSENGER' }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED', message: 'OTP is invalid' });
  });

  it('rejects an expired OTP', async () => {
    let now = new Date('2026-01-01T00:00:00.000Z');
    const sms = new DevelopmentSmsProvider();
    const service = new AuthServiceImpl(store, {
      phoneOtp: new SmsBackedPhoneOtpProvider(sms),
      sms,
      now: () => now,
      generateCode: () => '123456',
    });
    await service.requestOtp({ phoneNumber: phone });
    now = new Date('2026-01-01T00:06:00.000Z');
    await expect(
      service.verifyOtp({ phoneNumber: phone, code: '123456', role: 'PASSENGER' }),
    ).rejects.toMatchObject({ message: 'OTP has expired' });
  });

  it('locks out after five failed attempts', async () => {
    const { service } = createService(store);
    await service.requestOtp({ phoneNumber: phone });
    for (let i = 0; i < 5; i += 1) {
      await expect(
        service.verifyOtp({ phoneNumber: phone, code: '000000', role: 'PASSENGER' }),
      ).rejects.toBeInstanceOf(AppError);
    }
    await expect(
      service.verifyOtp({ phoneNumber: phone, code: '123456', role: 'PASSENGER' }),
    ).rejects.toMatchObject({ message: 'OTP attempts exhausted' });
  });

  it('enforces the resend cooldown', async () => {
    const { service } = createService(store);
    await service.requestOtp({ phoneNumber: phone });
    await expect(service.requestOtp({ phoneNumber: phone })).rejects.toMatchObject({
      code: 'RATE_LIMITED',
    });
  });

  it('prevents OTP replay after a successful verification', async () => {
    const { service } = createService(store);
    await service.requestOtp({ phoneNumber: phone });
    await service.verifyOtp({ phoneNumber: phone, code: '123456', role: 'PASSENGER' });
    await expect(
      service.verifyOtp({ phoneNumber: phone, code: '123456', role: 'PASSENGER' }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('rejects concurrent OTP verification for the same challenge', async () => {
    const { service } = createService(store);
    await service.requestOtp({ phoneNumber: phone });

    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    store.onEnterVerify = () => gate;

    const first = service.verifyOtp({ phoneNumber: phone, code: '123456', role: 'PASSENGER' });
    await vi.waitFor(() => expect(store.isOtpLocked(phone)).toBe(true));
    const second = service.verifyOtp({ phoneNumber: phone, code: '123456', role: 'PASSENGER' });
    const secondResult = await second.catch((error: unknown) => error);
    release();
    const firstResult = await first;

    expect(firstResult.user.phoneNumber).toBe(phone);
    expect(secondResult).toMatchObject({ code: 'CONFLICT' });
  });
});

describe('access JWTs', () => {
  it('accepts a valid access token', () => {
    const token = signAccessToken(
      { sub: randomUUID(), role: 'PASSENGER' },
      env.JWT_ACCESS_SECRET,
      900,
      tokenOptions,
    );
    expect(verifyAccessToken(token, env.JWT_ACCESS_SECRET, tokenOptions).role).toBe('PASSENGER');
  });

  it('rejects an invalid signature', () => {
    const token = signAccessToken(
      { sub: randomUUID(), role: 'PASSENGER' },
      env.JWT_ACCESS_SECRET,
      900,
      tokenOptions,
    );
    expect(() => verifyAccessToken(token, env.JWT_REFRESH_SECRET, tokenOptions)).toThrow(
      /invalid or expired/,
    );
  });

  it('rejects an expired token', () => {
    const token = signAccessToken(
      { sub: randomUUID(), role: 'PASSENGER' },
      env.JWT_ACCESS_SECRET,
      1,
      tokenOptions,
    );
    const payload = jwt.decode(token) as jwt.JwtPayload;
    expect(() =>
      jwt.verify(token, env.JWT_ACCESS_SECRET, {
        algorithms: [ACCESS_TOKEN_ALGORITHM],
        issuer: tokenOptions.issuer,
        audience: tokenOptions.audience,
        clockTimestamp: (payload.exp ?? 0) + 10,
      }),
    ).toThrow();
  });

  it('rejects wrong issuer or audience', () => {
    const token = signAccessToken(
      { sub: randomUUID(), role: 'RIDER' },
      env.JWT_ACCESS_SECRET,
      900,
      tokenOptions,
    );
    expect(() =>
      verifyAccessToken(token, env.JWT_ACCESS_SECRET, {
        issuer: 'other-issuer',
        audience: tokenOptions.audience,
      }),
    ).toThrow(/invalid or expired/);
    expect(() =>
      verifyAccessToken(token, env.JWT_ACCESS_SECRET, {
        issuer: tokenOptions.issuer,
        audience: 'other-audience',
      }),
    ).toThrow(/invalid or expired/);
  });

  it('rejects unsupported algorithms (alg none / RS256)', () => {
    const noneToken = [
      Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url'),
      Buffer.from(
        JSON.stringify({
          sub: randomUUID(),
          role: 'PASSENGER',
          iss: tokenOptions.issuer,
          aud: tokenOptions.audience,
        }),
      ).toString('base64url'),
      '',
    ].join('.');
    expect(() => verifyAccessToken(noneToken, env.JWT_ACCESS_SECRET, tokenOptions)).toThrow(
      /invalid or expired/,
    );

    const hs512 = jwt.sign({ role: 'PASSENGER' }, env.JWT_ACCESS_SECRET, {
      algorithm: 'HS512',
      subject: randomUUID(),
      expiresIn: 900,
      issuer: tokenOptions.issuer,
      audience: tokenOptions.audience,
    });
    expect(() => verifyAccessToken(hs512, env.JWT_ACCESS_SECRET, tokenOptions)).toThrow(
      /invalid or expired/,
    );
  });
});

describe('refresh sessions', () => {
  let store: MemoryAuthStore;

  beforeEach(() => {
    store = new MemoryAuthStore();
  });

  it('refreshes successfully and rotates the refresh token', async () => {
    const { service } = createService(store);
    await service.requestOtp({ phoneNumber: phone });
    const session = await service.verifyOtp({
      phoneNumber: phone,
      code: '123456',
      role: 'PASSENGER',
    });
    const refreshed = await service.refresh({ refreshToken: session.refreshToken });
    expect(refreshed.refreshToken).not.toBe(session.refreshToken);
    expect(refreshed.accessToken).toBeTruthy();
    await expect(service.refresh({ refreshToken: session.refreshToken })).rejects.toMatchObject({
      message: 'Refresh token reuse detected',
    });
  });

  it('logs out and revokes the current session', async () => {
    const { service } = createService(store);
    await service.requestOtp({ phoneNumber: phone });
    const session = await service.verifyOtp({
      phoneNumber: phone,
      code: '123456',
      role: 'PASSENGER',
    });
    const result = await service.logout({ refreshToken: session.refreshToken }, session.user.id);
    expect(result).toEqual({ revoked: true });
    await expect(service.refresh({ refreshToken: session.refreshToken })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  it('rejects a revoked session on refresh', async () => {
    const { service, now } = createService(store);
    await service.requestOtp({ phoneNumber: phone });
    const session = await service.verifyOtp({
      phoneNumber: phone,
      code: '123456',
      role: 'PASSENGER',
    });
    await service.logout({ refreshToken: session.refreshToken }, session.user.id);
    await expect(service.refresh({ refreshToken: session.refreshToken })).rejects.toMatchObject({
      message: 'Refresh token reuse detected',
    });
    expect(store.refreshTokens.every((row) => row.revokedAt !== null || row.createdAt > now)).toBe(
      true,
    );
  });

  it('rejects an expired refresh token', async () => {
    let now = new Date('2026-01-01T00:00:00.000Z');
    const sms = new DevelopmentSmsProvider();
    const service = new AuthServiceImpl(store, {
      phoneOtp: new SmsBackedPhoneOtpProvider(sms),
      sms,
      now: () => now,
      generateCode: () => '123456',
    });
    await service.requestOtp({ phoneNumber: phone });
    const session = await service.verifyOtp({
      phoneNumber: phone,
      code: '123456',
      role: 'PASSENGER',
    });
    now = new Date(now.getTime() + env.JWT_REFRESH_TTL_SECONDS * 1000 + 1000);
    await expect(service.refresh({ refreshToken: session.refreshToken })).rejects.toMatchObject({
      message: 'Refresh token has expired',
    });
  });

  it('detects refresh-token reuse and revokes the family', async () => {
    const { service } = createService(store);
    await service.requestOtp({ phoneNumber: phone });
    const session = await service.verifyOtp({
      phoneNumber: phone,
      code: '123456',
      role: 'PASSENGER',
    });
    const rotated = await service.refresh({ refreshToken: session.refreshToken });
    await expect(service.refresh({ refreshToken: session.refreshToken })).rejects.toMatchObject({
      message: 'Refresh token reuse detected',
    });
    await expect(service.refresh({ refreshToken: rotated.refreshToken })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  it('rejects concurrent refresh attempts for the same token', async () => {
    const { service } = createService(store);
    await service.requestOtp({ phoneNumber: phone });
    const session = await service.verifyOtp({
      phoneNumber: phone,
      code: '123456',
      role: 'PASSENGER',
    });

    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    store.onEnterRefresh = () => gate;
    const presentedHash = hashSecretValue(session.refreshToken, env.JWT_REFRESH_SECRET);

    const first = service.refresh({ refreshToken: session.refreshToken });
    await vi.waitFor(() => expect(store.isRefreshLocked(presentedHash)).toBe(true));
    const second = service.refresh({ refreshToken: session.refreshToken });
    const secondResult = await second.catch((error: unknown) => error);
    release();
    const firstResult = await first;

    expect(firstResult.refreshToken).toBeTruthy();
    expect(secondResult).toMatchObject({ code: 'CONFLICT' });
  });
});

describe('auth middleware helpers', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('signs tokens that authenticate middleware can verify', () => {
    const userId = randomUUID();
    const token = signAccessToken(
      { sub: userId, role: 'PASSENGER' },
      env.JWT_ACCESS_SECRET,
      900,
      tokenOptions,
    );
    expect(verifyAccessToken(token, env.JWT_ACCESS_SECRET, tokenOptions)).toEqual({
      sub: userId,
      role: 'PASSENGER',
      purpose: 'access',
    });
  });

  it('treats suspended accounts as forbidden at the service boundary', async () => {
    const store = new MemoryAuthStore();
    const userId = randomUUID();
    store.seedUser({
      id: userId,
      phoneNumber: phone,
      role: 'PASSENGER',
      status: 'SUSPENDED',
      displayName: null,
    });
    const refreshToken = 'suspended-refresh-token-value-012345';
    await store.createRefreshSessionForUser({
      userId,
      tokenHash: hashSecretValue(refreshToken, env.JWT_REFRESH_SECRET),
      expiresAt: new Date('2030-01-01T00:00:00.000Z'),
    });
    const { service } = createService(store);
    await expect(service.refresh({ refreshToken })).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message: 'Account is suspended',
    });
  });

  it('uses Vynfy OTP generate/verify when the phone OTP provider is Vynfy (mocked HTTP)', async () => {
    const otpStore = new MemoryAuthStore();
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      const href = String(url);
      if (href === VYNFY_OTP_GENERATE_URL) {
        return new Response(JSON.stringify({ success: true, otp_id: 42, message: 'OTP sent successfully' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (href === VYNFY_OTP_VERIFY_URL) {
        return new Response(
          JSON.stringify({
            success: true,
            otp_id: 42,
            message: 'OTP verified successfully',
            phone_number: '233244123456',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response('not found', { status: 404 });
    });
    const phoneOtp = new VynfyOtpProvider({
      apiKey: 'test-vynfy-key-not-real',
      senderId: 'Cyrlo',
      fetchImpl,
    });
    const service = new AuthServiceImpl(otpStore, {
      phoneOtp,
      now: () => new Date('2026-01-01T00:00:00.000Z'),
      generateCode: () => '654321',
    });

    await service.requestOtp({ phoneNumber: phone });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(String(fetchImpl.mock.calls[0]?.[0])).toBe(VYNFY_OTP_GENERATE_URL);
    const init = fetchImpl.mock.calls[0]?.[1] as RequestInit;
    const payload = JSON.parse(String(init.body)) as {
      number: string;
      sender_id: string;
      message: string;
      medium: string;
      otp_type: string;
    };
    expect(payload.number).toBe('233244123456');
    expect(payload.sender_id).toBe('Cyrlo');
    expect(payload.medium).toBe('sms');
    expect(payload.otp_type).toBe('numeric');
    expect(payload.message).toContain('%otp_code%');
    expect(payload.message).not.toContain('654321');

    const session = await service.verifyOtp({
      phoneNumber: phone,
      code: '654321',
      role: 'PASSENGER',
    });
    expect(session.accessToken).toBeTruthy();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(String(fetchImpl.mock.calls[1]?.[0])).toBe(VYNFY_OTP_VERIFY_URL);
    const verifyPayload = JSON.parse(String((fetchImpl.mock.calls[1]?.[1] as RequestInit).body)) as {
      number: string;
      code: string;
    };
    expect(verifyPayload).toEqual({ number: '233244123456', code: '654321' });

    await expect(
      service.verifyOtp({ phoneNumber: phone, code: '654321', role: 'PASSENGER' }),
    ).rejects.toMatchObject({ message: 'OTP is invalid' });
  });
});
