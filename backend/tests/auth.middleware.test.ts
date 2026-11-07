import { randomUUID } from 'node:crypto';

import express from 'express';
import rateLimit from 'express-rate-limit';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { AppError } from '../src/common/errors/app-error.js';
import { errorHandler } from '../src/common/errors/error-handler.js';
import {
  authenticate,
  createRequireActiveAccount,
} from '../src/common/middleware/authenticate.js';
import { sendSuccess } from '../src/common/http/response.js';
import { signAccessToken } from '../src/common/security/tokens.js';
import { env } from '../src/config/env.js';
import '../src/common/types/express.js';

const tokenOptions = { issuer: env.JWT_ISSUER, audience: env.JWT_AUDIENCE };

function buildApp(findUser: Parameters<typeof createRequireActiveAccount>[0]) {
  const app = express();
  app.get(
    '/protected',
    authenticate,
    createRequireActiveAccount(findUser),
    (req, res) => {
      sendSuccess(res, { userId: req.auth!.sub });
    },
  );
  app.use(errorHandler);
  return app;
}

describe('authentication middleware', () => {
  it('rejects a protected route without a token', async () => {
    const app = buildApp(async () => null);
    const response = await request(app).get('/protected');
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHORIZED');
  });

  it('rejects a protected route with an invalid token', async () => {
    const app = buildApp(async () => null);
    const response = await request(app)
      .get('/protected')
      .set('Authorization', 'Bearer not-a-jwt');
    expect(response.status).toBe(401);
  });

  it('allows a protected route with a valid token for an active account', async () => {
    const userId = randomUUID();
    const token = signAccessToken(
      { sub: userId, role: 'PASSENGER' },
      env.JWT_ACCESS_SECRET,
      900,
      tokenOptions,
    );
    const app = buildApp(async (id) =>
      id === userId ? { id: userId, status: 'ACTIVE', role: 'PASSENGER' } : null,
    );
    const response = await request(app).get('/protected').set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(200);
    expect(response.body.data.userId).toBe(userId);
  });

  it('rejects a suspended account', async () => {
    const userId = randomUUID();
    const token = signAccessToken(
      { sub: userId, role: 'PASSENGER' },
      env.JWT_ACCESS_SECRET,
      900,
      tokenOptions,
    );
    const app = buildApp(async (id) =>
      id === userId ? { id: userId, status: 'SUSPENDED', role: 'PASSENGER' } : null,
    );
    const response = await request(app).get('/protected').set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(403);
    expect(response.body.error.message).toBe('Account is suspended');
  });

  it('rate-limits OTP-style endpoints after the configured burst', async () => {
    const limiter = rateLimit({
      windowMs: 60_000,
      limit: 2,
      standardHeaders: true,
      legacyHeaders: false,
      handler: (_req, _res, next) => {
        next(
          new AppError({
            status: 429,
            code: 'RATE_LIMITED',
            message: 'Too many OTP requests. Try again later.',
          }),
        );
      },
    });
    const app = express();
    app.post('/otp', limiter, (_req, res) => sendSuccess(res, { ok: true }));
    app.use(errorHandler);

    expect((await request(app).post('/otp')).status).toBe(200);
    expect((await request(app).post('/otp')).status).toBe(200);
    const limited = await request(app).post('/otp');
    expect(limited.status).toBe(429);
    expect(limited.body.error.code).toBe('RATE_LIMITED');
  });
});
