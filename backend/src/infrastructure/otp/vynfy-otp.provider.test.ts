import { afterEach, describe, expect, it, vi } from 'vitest';

import { AppError } from '../../common/errors/app-error.js';
import {
  createPhoneOtpProvider,
  SmsBackedPhoneOtpProvider,
} from './phone-otp.provider.js';
import {
  VYNFY_OTP_GENERATE_URL,
  VYNFY_OTP_VERIFY_URL,
  VynfyOtpProvider,
} from './vynfy-otp.provider.js';
import { DevelopmentSmsProvider } from '../sms/sms.provider.js';

const apiKey = 'test-vynfy-key-not-real';
const senderId = 'Cyrlo';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('VynfyOtpProvider', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('posts the documented generate payload and returns remote mode', async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe(VYNFY_OTP_GENERATE_URL);
      const headers = new Headers(init?.headers);
      expect(headers.get('X-API-Key')).toBe(apiKey);
      const payload = JSON.parse(String(init?.body)) as Record<string, unknown>;
      expect(payload).toMatchObject({
        number: '233244123456',
        sender_id: senderId,
        medium: 'sms',
        otp_type: 'numeric',
        length: 6,
        expiry: 5,
      });
      expect(String(payload.message)).toContain('%otp_code%');
      return jsonResponse(200, { success: true, otp_id: 99 });
    });

    const provider = new VynfyOtpProvider({ apiKey, senderId, fetchImpl });
    const result = await provider.request({
      phoneNumber: '+233244123456',
      expiryMinutes: 5,
      length: 6,
    });
    expect(result).toEqual({ mode: 'remote', providerOtpId: '99' });
  });

  it('verifies against the documented verify endpoint', async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe(VYNFY_OTP_VERIFY_URL);
      expect(JSON.parse(String(init?.body))).toEqual({
        number: '233244123456',
        code: '123456',
      });
      return jsonResponse(200, { success: true });
    });
    const provider = new VynfyOtpProvider({ apiKey, senderId, fetchImpl });
    await provider.verifyRemote({ phoneNumber: '+233244123456', code: '123456' });
  });

  it('maps OTP_PENDING to RATE_LIMITED', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(429, { success: false, code: 'OTP_PENDING' }),
    );
    const provider = new VynfyOtpProvider({ apiKey, senderId, fetchImpl });
    await expect(
      provider.request({ phoneNumber: '+233244123456', expiryMinutes: 5, length: 6 }),
    ).rejects.toMatchObject({ code: 'RATE_LIMITED' });
  });

  it('maps INVALID_OTP on verify', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(400, { code: 'INVALID_OTP' }));
    const provider = new VynfyOtpProvider({ apiKey, senderId, fetchImpl });
    await expect(
      provider.verifyRemote({ phoneNumber: '+233244123456', code: '000000' }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED', message: 'OTP is invalid' });
  });
});

describe('createPhoneOtpProvider', () => {
  it('selects Vynfy OTP when SMS_PROVIDER=vynfy with credentials', () => {
    const provider = createPhoneOtpProvider({
      smsProvider: 'vynfy',
      vynfyApiKey: apiKey,
      vynfySenderId: senderId,
      sms: new DevelopmentSmsProvider(),
    });
    expect(provider).toBeInstanceOf(VynfyOtpProvider);
    expect(provider.describe?.().mode).toBe('remote');
  });

  it('falls back to SMS-backed local OTP otherwise', () => {
    const provider = createPhoneOtpProvider({
      smsProvider: '',
      vynfyApiKey: '',
      vynfySenderId: '',
      sms: new DevelopmentSmsProvider(),
    });
    expect(provider).toBeInstanceOf(SmsBackedPhoneOtpProvider);
    expect(provider.describe?.().mode).toBe('local');
  });
});

describe('SmsBackedPhoneOtpProvider', () => {
  it('requires a local code and sends via SMS', async () => {
    const sms = new DevelopmentSmsProvider();
    const provider = new SmsBackedPhoneOtpProvider(sms);
    await expect(
      provider.request({ phoneNumber: '+233244123456', expiryMinutes: 5, length: 6 }),
    ).rejects.toBeInstanceOf(AppError);

    const result = await provider.request({
      phoneNumber: '+233244123456',
      localCode: '123456',
      expiryMinutes: 5,
      length: 6,
    });
    expect(result).toEqual({ mode: 'local', code: '123456' });
    expect(sms.sent).toHaveLength(1);
  });
});
