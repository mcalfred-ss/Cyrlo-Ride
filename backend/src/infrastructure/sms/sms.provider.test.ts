import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createSmsProvider,
  describeSmsProvider,
  DevelopmentSmsProvider,
  UnconfiguredSmsProvider,
  UnsupportedSmsProvider,
} from './sms.provider.js';

describe('SMS provider factory', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses development adapter when credentials are missing outside production', () => {
    const provider = createSmsProvider({
      provider: '',
      apiKey: '',
      nodeEnv: 'test',
    });
    expect(provider).toBeInstanceOf(DevelopmentSmsProvider);
    expect(describeSmsProvider(provider)).toEqual({
      configured: true,
      adapter: 'development',
      ready: true,
    });
  });

  it('fails closed in production when credentials are missing', async () => {
    const provider = createSmsProvider({
      provider: '',
      apiKey: '',
      nodeEnv: 'production',
    });
    expect(provider).toBeInstanceOf(UnconfiguredSmsProvider);
    expect(describeSmsProvider(provider).ready).toBe(false);
    await expect(provider.send({ to: '+233244000000', body: '123456' })).rejects.toMatchObject({
      status: 503,
      code: 'SERVICE_UNAVAILABLE',
    });
  });

  it('fails closed when credentials name an unwired vendor (do not invent adapters)', async () => {
    const provider = createSmsProvider({
      provider: 'existing-vendor',
      apiKey: 'secret-key-value',
      nodeEnv: 'production',
    });
    expect(provider).toBeInstanceOf(UnsupportedSmsProvider);
    expect(describeSmsProvider(provider)).toEqual({
      configured: true,
      adapter: 'existing-vendor',
      ready: false,
    });
    await expect(provider.send({ to: '+233244000000', body: '123456' })).rejects.toMatchObject({
      status: 503,
      code: 'SERVICE_UNAVAILABLE',
    });
  });

  it('never stores OTP body in the development send record', async () => {
    const provider = new DevelopmentSmsProvider();
    await provider.send({ to: '+233244000111', body: '987654' });
    expect(provider.sent).toEqual([{ to: '+233244000111', body: '[redacted]' }]);
    expect(JSON.stringify(provider.sent)).not.toContain('987654');
  });
});
