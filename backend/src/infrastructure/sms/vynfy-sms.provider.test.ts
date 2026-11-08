import { afterEach, describe, expect, it, vi } from 'vitest';

import { AppError } from '../../common/errors/app-error.js';
import {
  createSmsProvider,
  describeSmsProvider,
  DevelopmentSmsProvider,
  UnconfiguredSmsProvider,
} from './sms.provider.js';
import {
  normalizeGhanaRecipientForVynfy,
  VynfySmsProvider,
  VYNFY_SMS_SEND_URL,
} from './vynfy-sms.provider.js';

const otpBody = 'Your Cyrlo Ride code is 123456. It expires in 5 minutes.';
const apiKey = 'test-vynfy-key-not-real';
const senderId = 'Cyrlo';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('normalizeGhanaRecipientForVynfy', () => {
  it('normalizes E.164 Ghana numbers to 233XXXXXXXXX', () => {
    expect(normalizeGhanaRecipientForVynfy('+233244123456')).toBe('233244123456');
  });

  it('rejects invalid phone numbers before any HTTP call', () => {
    expect(() => normalizeGhanaRecipientForVynfy('+15551234567')).toThrow(AppError);
    expect(() => normalizeGhanaRecipientForVynfy('0244123456')).toThrow(AppError);
    expect(() => normalizeGhanaRecipientForVynfy('')).toThrow(AppError);
  });
});

describe('VynfySmsProvider', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('accepts a successful Vynfy API response and sends the documented payload', async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe(VYNFY_SMS_SEND_URL);
      expect(init?.method).toBe('POST');
      const headers = new Headers(init?.headers);
      expect(headers.get('X-API-Key')).toBe(apiKey);
      expect(headers.get('Content-Type')).toBe('application/json');
      const payload = JSON.parse(String(init?.body)) as {
        sender: string;
        recipients: string[];
        message: string;
      };
      expect(payload.sender).toBe(senderId);
      expect(payload.recipients).toEqual(['233244123456']);
      expect(payload.message).toBe(otpBody);
      return jsonResponse(200, { ok: true });
    });

    const provider = new VynfySmsProvider({ apiKey, senderId, fetchImpl });
    await provider.send({ to: '+233244123456', body: otpBody });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('uses the configured sender ID', async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const payload = JSON.parse(String(init?.body)) as { sender: string };
      expect(payload.sender).toBe('MyBrand');
      return jsonResponse(200, {});
    });
    const provider = new VynfySmsProvider({
      apiKey,
      senderId: 'MyBrand',
      fetchImpl,
    });
    await provider.send({ to: '+233201234567', body: 'hello' });
  });

  it('fails closed when API key is missing at construction', () => {
    expect(() => new VynfySmsProvider({ apiKey: '', senderId })).toThrow(AppError);
  });

  it('fails closed when sender ID is missing at construction', () => {
    expect(() => new VynfySmsProvider({ apiKey, senderId: '  ' })).toThrow(AppError);
  });

  it('maps provider authentication failure', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(401, { error: 'unauthorized' }));
    const provider = new VynfySmsProvider({ apiKey, senderId, fetchImpl });
    await expect(provider.send({ to: '+233244123456', body: otpBody })).rejects.toMatchObject({
      status: 503,
      code: 'SERVICE_UNAVAILABLE',
      message: 'SMS provider authentication failed',
    });
  });

  it('maps provider rejection (e.g. credits / bad request) without inventing fields', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(400, { error: 'rejected' }));
    const provider = new VynfySmsProvider({ apiKey, senderId, fetchImpl });
    await expect(provider.send({ to: '+233244123456', body: otpBody })).rejects.toMatchObject({
      status: 503,
      code: 'SERVICE_UNAVAILABLE',
      message: 'SMS provider rejected the request',
    });
  });

  it('maps HTTP rate limiting', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(429, { error: 'slow down' }));
    const provider = new VynfySmsProvider({ apiKey, senderId, fetchImpl });
    await expect(provider.send({ to: '+233244123456', body: otpBody })).rejects.toMatchObject({
      status: 429,
      code: 'RATE_LIMITED',
    });
  });

  it('maps provider server errors', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(502, { error: 'bad gateway' }));
    const provider = new VynfySmsProvider({ apiKey, senderId, fetchImpl });
    await expect(provider.send({ to: '+233244123456', body: otpBody })).rejects.toMatchObject({
      status: 503,
      message: 'SMS provider server error',
    });
  });

  it('treats request timeout as ambiguous failure (no blind retry)', async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      await new Promise<void>((_, reject) => {
        init?.signal?.addEventListener('abort', () => {
          const err = new Error('aborted');
          err.name = 'AbortError';
          reject(err);
        });
      });
      return jsonResponse(200, {});
    });
    const provider = new VynfySmsProvider({
      apiKey,
      senderId,
      fetchImpl,
      timeoutMs: 20,
    });
    await expect(provider.send({ to: '+233244123456', body: otpBody })).rejects.toMatchObject({
      status: 503,
      message: 'SMS provider request timed out; delivery status is ambiguous',
    });
  });

  it('accepts 2xx even when the body is malformed JSON', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response('not-json{{{', {
          status: 200,
          headers: { 'Content-Type': 'text/plain' },
        }),
    );
    const provider = new VynfySmsProvider({ apiKey, senderId, fetchImpl });
    await expect(provider.send({ to: '+233244123456', body: otpBody })).resolves.toBeUndefined();
  });

  it('rejects invalid destination without calling fetch', async () => {
    const fetchImpl = vi.fn();
    const provider = new VynfySmsProvider({ apiKey, senderId, fetchImpl });
    await expect(provider.send({ to: 'not-a-phone', body: otpBody })).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('rejects empty message without calling fetch', async () => {
    const fetchImpl = vi.fn();
    const provider = new VynfySmsProvider({ apiKey, senderId, fetchImpl });
    await expect(provider.send({ to: '+233244123456', body: '   ' })).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('does not leak API key or OTP in thrown errors', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(500, { secret: apiKey, otp: '123456' }));
    const provider = new VynfySmsProvider({ apiKey, senderId, fetchImpl });
    try {
      await provider.send({ to: '+233244123456', body: otpBody });
      expect.unreachable('expected throw');
    } catch (error) {
      const serialized = JSON.stringify(error, Object.getOwnPropertyNames(error as object));
      expect(serialized).not.toContain(apiKey);
      expect(serialized).not.toContain('123456');
      expect(String((error as Error).message)).not.toContain(apiKey);
      expect(String((error as Error).message)).not.toContain('123456');
    }
  });
});

describe('createSmsProvider with vynfy', () => {
  it('returns a ready Vynfy adapter when configured', () => {
    const provider = createSmsProvider({
      provider: 'vynfy',
      apiKey,
      senderId,
      nodeEnv: 'production',
      fetchImpl: vi.fn(async () => jsonResponse(200, {})),
    });
    expect(provider).toBeInstanceOf(VynfySmsProvider);
    expect(describeSmsProvider(provider)).toEqual({
      configured: true,
      adapter: 'vynfy',
      ready: true,
    });
  });

  it('does not fall back to development when vynfy sender is missing in production', () => {
    const provider = createSmsProvider({
      provider: 'vynfy',
      apiKey,
      senderId: '',
      nodeEnv: 'production',
    });
    expect(provider).toBeInstanceOf(UnconfiguredSmsProvider);
    expect(describeSmsProvider(provider).ready).toBe(false);
  });

  it('keeps local development adapter when SMS_PROVIDER is empty', () => {
    const provider = createSmsProvider({
      provider: '',
      apiKey: '',
      nodeEnv: 'test',
    });
    expect(provider).toBeInstanceOf(DevelopmentSmsProvider);
  });
});
