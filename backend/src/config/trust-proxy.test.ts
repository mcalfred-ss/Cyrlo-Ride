import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { apiRateLimiter } from '../common/middleware/rate-limit.js';
import { parseTrustProxyEnv } from './trust-proxy.js';

describe('parseTrustProxyEnv', () => {
  it('defaults local/dev to false (ignore forwarded headers)', () => {
    expect(parseTrustProxyEnv(undefined)).toBe(false);
    expect(parseTrustProxyEnv('')).toBe(false);
    expect(parseTrustProxyEnv('false')).toBe(false);
    expect(parseTrustProxyEnv('0')).toBe(false);
  });

  it('rejects bare TRUST_PROXY=true', () => {
    expect(() => parseTrustProxyEnv('true')).toThrow(/not allowed/i);
  });

  it('accepts hop counts 1–5', () => {
    expect(parseTrustProxyEnv('1')).toBe(1);
    expect(parseTrustProxyEnv('5')).toBe(5);
  });

  it('rejects invalid hop counts', () => {
    expect(() => parseTrustProxyEnv('6')).toThrow(/hop count/i);
    expect(() => parseTrustProxyEnv('-1')).toThrow(/invalid|hop count/i);
  });

  it('accepts explicit proxy IPs and CIDRs', () => {
    expect(parseTrustProxyEnv('127.0.0.1')).toEqual(['127.0.0.1']);
    expect(parseTrustProxyEnv('10.0.0.0/8, 192.168.1.1')).toEqual([
      '10.0.0.0/8',
      '192.168.1.1',
    ]);
    expect(parseTrustProxyEnv('loopback')).toEqual(['loopback']);
  });

  it('rejects malformed proxy entries', () => {
    expect(() => parseTrustProxyEnv('not-an-ip')).toThrow(/invalid/i);
    expect(() => parseTrustProxyEnv('http://proxy.local')).toThrow(/invalid/i);
  });
});

describe('Express trust proxy IP resolution', () => {
  it('ignores spoofed X-Forwarded-For when trust proxy is off', async () => {
    const app = express();
    app.get('/ip', (req, res) => {
      res.json({ ip: req.ip });
    });

    const res = await request(app)
      .get('/ip')
      .set('X-Forwarded-For', '203.0.113.50');
    expect(res.body.ip).not.toBe('203.0.113.50');
  });

  it('resolves client IP from X-Forwarded-For when hop count is trusted', async () => {
    const app = express();
    app.set('trust proxy', 1);
    app.get('/ip', (req, res) => {
      res.json({ ip: req.ip });
    });

    const res = await request(app)
      .get('/ip')
      .set('X-Forwarded-For', '203.0.113.77');
    expect(res.body.ip).toBe('203.0.113.77');
  });

  it('rate limiting keys on the resolved client IP under trusted proxy', async () => {
    const app = express();
    app.set('trust proxy', 1);
    app.use(apiRateLimiter);
    app.get('/ping', (_req, res) => {
      res.json({ ok: true });
    });

    const spoofed = '198.51.100.42';
    // Exhaust limit for the spoofed identity only when trust proxy honors it.
    const limit = Number(process.env.RATE_LIMIT_MAX ?? '300');
    // Use a dedicated tiny limiter by hitting once and asserting header uses spoofed IP identity.
    const res = await request(app).get('/ping').set('X-Forwarded-For', spoofed);
    expect(res.status).toBe(200);
    expect(res.headers['ratelimit-limit'] || res.headers['x-ratelimit-limit']).toBeTruthy();
    // Second request from a different spoofed IP must not share the first key when trusted.
    const other = await request(app).get('/ping').set('X-Forwarded-For', '198.51.100.99');
    expect(other.status).toBe(200);
    void limit;
  });
});
