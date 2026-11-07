import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';
import { errorHandler } from '../src/common/errors/error-handler.js';
import { validate } from '../src/common/middleware/validate.js';
import { createHealthRouter } from '../src/common/routes/health.routes.js';
import { paginationMeta } from '../src/common/utils/pagination.js';
import { RealtimeEvent } from '../src/infrastructure/realtime/events.js';
import { requestOtpSchema } from '../src/modules/auth/module.schema.js';
import { createBookingSchema } from '../src/modules/bookings/module.schema.js';
import { initiateBookingFeeSchema } from '../src/modules/payments/module.schema.js';

describe('HTTP foundation', () => {
  it('GET /api/v1/health returns the liveness envelope', async () => {
    const response = await request(createApp()).get('/api/v1/health');
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.status).toBe('ok');
    expect(response.body.data.service).toBe('cyrlo-ride-api');
    expect(response.headers['x-request-id']).toEqual(expect.any(String));
  });

  it('returns the standard error envelope for unknown routes', async () => {
    const response = await request(createApp()).get('/api/v1/this-route-does-not-exist');
    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({
      success: false,
      error: { code: 'NOT_FOUND' },
    });
  });

  it('reports an unavailable database without connecting for the test double', async () => {
    const app = express();
    app.use(
      '/health',
      createHealthRouter({
        checkDatabase: async () => {
          throw new Error('down');
        },
      }),
    );
    app.use(errorHandler);
    const response = await request(app).get('/health/ready');
    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe('SERVICE_UNAVAILABLE');
  });
});

describe('request contracts', () => {
  it('accepts a Ghana phone number and rejects a client-supplied fare', () => {
    expect(requestOtpSchema.safeParse({ phoneNumber: '+233201234567' }).success).toBe(true);
    expect(requestOtpSchema.safeParse({ phoneNumber: '0201234567' }).success).toBe(false);
    const booking = createBookingSchema.safeParse({
      pickup: { latitude: 5.6037, longitude: -0.187 },
      destination: { latitude: 5.55, longitude: -0.2 },
      farePesewas: 2500,
    });
    expect(booking.success).toBe(false);
  });

  it('does not let the client choose the booking fee amount', () => {
    expect(initiateBookingFeeSchema.safeParse({ bookingId: '6d1f6c5e-3c3e-4f1a-9c1e-0d0c2a6b7e11', amountPesewas: 100 }).success).toBe(false);
  });

  it('calculates pagination', () => {
    expect(paginationMeta(1, 20, 21).hasNextPage).toBe(true);
    expect(paginationMeta(2, 20, 21).hasNextPage).toBe(false);
  });

  it('keeps the Socket.IO event names stable', () => {
    expect(Object.values(RealtimeEvent)).toEqual([
      'booking.requested',
      'booking.accepted',
      'booking.started',
      'booking.rejected',
      'booking.cancelled',
      'booking.completed',
      'rider.location.updated',
      'rider.availability.updated',
    ]);
  });
});

describe('validation middleware', () => {
  it('stores parsed input and rejects invalid JSON bodies', async () => {
    const app = express();
    app.use(express.json());
    app.post('/echo', validate({ body: requestOtpSchema }), (_req, res) => {
      res.json({ success: true, data: res.locals.validated });
    });
    app.use(errorHandler);
    const ok = await request(app).post('/echo').send({ phoneNumber: '+233201234567' });
    expect(ok.status).toBe(200);
    expect(ok.body.data.body.phoneNumber).toBe('+233201234567');
    const bad = await request(app).post('/echo').send({ phoneNumber: 'bad' });
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('VALIDATION_ERROR');
  });
});
