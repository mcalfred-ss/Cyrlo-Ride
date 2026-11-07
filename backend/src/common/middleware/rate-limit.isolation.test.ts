import express, { type Express } from 'express';
import rateLimit from 'express-rate-limit';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AppError } from '../errors/app-error.js';
import { errorHandler } from '../errors/error-handler.js';
import {
  clientIpKey,
  usesDedicatedRateLimiter,
} from './rate-limit.js';

function limitedApp(options: {
  generalMax: number;
  webhookMax: number;
  gpsMax: number;
  trustProxy?: number | false;
}): Express {
  const app = express();
  if (options.trustProxy !== false && options.trustProxy !== undefined) {
    app.set('trust proxy', options.trustProxy);
  }
  app.use(express.json());

  const general = rateLimit({
    windowMs: 60_000,
    limit: options.generalMax,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: clientIpKey,
    handler: (_req, _res, next) =>
      next(new AppError({ status: 429, code: 'RATE_LIMITED', message: 'general' })),
  });
  const webhook = rateLimit({
    windowMs: 60_000,
    limit: options.webhookMax,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: clientIpKey,
    handler: (_req, _res, next) =>
      next(new AppError({ status: 429, code: 'RATE_LIMITED', message: 'webhook' })),
  });
  const gps = rateLimit({
    windowMs: 60_000,
    limit: options.gpsMax,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
      const userId = req.headers['x-test-user'];
      if (typeof userId === 'string' && userId.length > 0) return `gps:user:${userId}`;
      return `gps:ip:${clientIpKey(req)}`;
    },
    handler: (_req, _res, next) =>
      next(new AppError({ status: 429, code: 'RATE_LIMITED', message: 'gps' })),
  });

  const api = express.Router();
  api.use((req, res, next) => {
    if (usesDedicatedRateLimiter(req.path, req.method)) {
      next();
      return;
    }
    general(req, res, next);
  });
  api.post('/payments/paystack/webhook', webhook, (_req, res) => {
    res.json({ accepted: true });
  });
  api.post('/locations/rider', (req, res, next) => {
    // Simulate authenticate attaching a user id before the GPS limiter.
    if (!req.headers['x-test-user']) {
      next(new AppError({ status: 401, code: 'UNAUTHORIZED', message: 'Missing auth' }));
      return;
    }
    next();
  }, gps, (_req, res) => {
    res.json({ ok: true });
  });
  api.get('/bookings', (_req, res) => {
    res.json({ ok: true });
  });
  app.use('/api/v1', api);
  app.use(errorHandler);
  return app;
}

describe('usesDedicatedRateLimiter', () => {
  it('isolates webhook and GPS POST only', () => {
    expect(usesDedicatedRateLimiter('/payments/paystack/webhook', 'POST')).toBe(true);
    expect(usesDedicatedRateLimiter('/locations/rider', 'POST')).toBe(true);
    expect(usesDedicatedRateLimiter('/locations/rider', 'GET')).toBe(false);
    expect(usesDedicatedRateLimiter('/locations/rider/me', 'GET')).toBe(false);
    expect(usesDedicatedRateLimiter('/bookings', 'GET')).toBe(false);
    expect(usesDedicatedRateLimiter('/health', 'GET')).toBe(false);
  });
});

describe('rate-limit isolation', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('keeps Paystack webhook traffic out of the general API allowance', async () => {
    const app = limitedApp({ generalMax: 2, webhookMax: 5, gpsMax: 5 });

    expect((await request(app).get('/api/v1/bookings')).status).toBe(200);
    expect((await request(app).get('/api/v1/bookings')).status).toBe(200);
    expect((await request(app).get('/api/v1/bookings')).status).toBe(429);

    // Webhooks still succeed after general bucket is exhausted.
    for (let i = 0; i < 3; i += 1) {
      const res = await request(app).post('/api/v1/payments/paystack/webhook').send({});
      expect(res.status).toBe(200);
    }
  });

  it('enforces a dedicated webhook abuse limit', async () => {
    const app = limitedApp({ generalMax: 50, webhookMax: 2, gpsMax: 50 });
    expect((await request(app).post('/api/v1/payments/paystack/webhook').send({})).status).toBe(
      200,
    );
    expect((await request(app).post('/api/v1/payments/paystack/webhook').send({})).status).toBe(
      200,
    );
    const blocked = await request(app).post('/api/v1/payments/paystack/webhook').send({});
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.message).toBe('webhook');
  });

  it('applies an independent GPS limit after auth and does not spend the general bucket', async () => {
    const app = limitedApp({ generalMax: 2, webhookMax: 50, gpsMax: 3 });

    for (let i = 0; i < 3; i += 1) {
      const res = await request(app)
        .post('/api/v1/locations/rider')
        .set('x-test-user', 'rider-a')
        .send({});
      expect(res.status).toBe(200);
    }
    const blocked = await request(app)
      .post('/api/v1/locations/rider')
      .set('x-test-user', 'rider-a')
      .send({});
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.message).toBe('gps');

    // General API still has full allowance.
    expect((await request(app).get('/api/v1/bookings')).status).toBe(200);
    expect((await request(app).get('/api/v1/bookings')).status).toBe(200);
  });

  it('rejects unauthenticated GPS updates before the limiter counts them as success', async () => {
    const app = limitedApp({ generalMax: 50, webhookMax: 50, gpsMax: 1 });
    const denied = await request(app).post('/api/v1/locations/rider').send({});
    expect(denied.status).toBe(401);

    const allowed = await request(app)
      .post('/api/v1/locations/rider')
      .set('x-test-user', 'rider-b')
      .send({});
    expect(allowed.status).toBe(200);
  });

  it('does not let spoofed X-Forwarded-For change the limit key when trust proxy is off', async () => {
    const app = limitedApp({
      generalMax: 2,
      webhookMax: 50,
      gpsMax: 50,
      trustProxy: false,
    });
    await request(app).get('/api/v1/bookings').set('X-Forwarded-For', '203.0.113.10');
    await request(app).get('/api/v1/bookings').set('X-Forwarded-For', '203.0.113.11');
    const third = await request(app)
      .get('/api/v1/bookings')
      .set('X-Forwarded-For', '203.0.113.12');
    // All share the direct socket IP when trust proxy is off → third is limited.
    expect(third.status).toBe(429);
  });

  it('keys general limits on trusted forwarded client IP when hop count is set', async () => {
    const app = limitedApp({
      generalMax: 1,
      webhookMax: 50,
      gpsMax: 50,
      trustProxy: 1,
    });
    expect(
      (await request(app).get('/api/v1/bookings').set('X-Forwarded-For', '198.51.100.1')).status,
    ).toBe(200);
    expect(
      (await request(app).get('/api/v1/bookings').set('X-Forwarded-For', '198.51.100.1')).status,
    ).toBe(429);
    expect(
      (await request(app).get('/api/v1/bookings').set('X-Forwarded-For', '198.51.100.2')).status,
    ).toBe(200);
  });
});
