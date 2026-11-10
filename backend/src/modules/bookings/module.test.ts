import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { BOOKING_FEE_PESEWAS } from '../../config/constants.js';
import { MemoryPaystackClient } from '../../infrastructure/payments/paystack-client.js';
import { createBookingSchema } from './module.schema.js';
import { decideRefunds, situationForMissingFeeRefund } from './booking-rules.js';
import {
  isInsideBoundingBox,
  isPointInBoundary,
  validateAndNormalizeBoundary,
} from '../service-zones/zone-geometry.js';

const polygon = {
  type: 'Polygon' as const,
  coordinates: [
    [
      [-1.63, 6.68],
      [-1.62, 6.68],
      [-1.62, 6.69],
      [-1.63, 6.69],
      [-1.63, 6.68],
    ],
  ],
};

describe('create booking schema', () => {
  it('requires vehicle category and rejects unsupported categories and invalid coordinates', () => {
    expect(
      createBookingSchema.safeParse({
        pickup: { latitude: 6.685, longitude: -1.625 },
        destination: { latitude: 6.686, longitude: -1.626 },
        vehicleCategory: 'PRAGYA',
      }).success,
    ).toBe(true);
    expect(
      createBookingSchema.safeParse({
        pickup: { latitude: 6.685, longitude: -1.625 },
        destination: { latitude: 6.686, longitude: -1.626 },
        vehicleCategory: 'MOTORCYCLE',
      }).success,
    ).toBe(false);
    expect(
      createBookingSchema.safeParse({
        pickup: { latitude: 91, longitude: -1.625 },
        destination: { latitude: 6.686, longitude: -1.626 },
        vehicleCategory: 'OKADA',
      }).success,
    ).toBe(false);
    expect(
      createBookingSchema.safeParse({
        pickup: { latitude: 6.685, longitude: -1.625 },
        destination: { latitude: 6.686, longitude: -1.626 },
        vehicleCategory: 'OKADA',
        bookingFeePesewas: 50,
      }).success,
    ).toBe(false);
  });
});

describe('pickup zone geometry', () => {
  it('accepts points inside Polygon and MultiPolygon and rejects outside / inactive bbox misses', () => {
    const normalized = validateAndNormalizeBoundary(polygon);
    expect(
      isPointInBoundary(6.685, -1.625, normalized.boundary),
    ).toBe(true);
    expect(isPointInBoundary(6.7, -1.625, normalized.boundary)).toBe(false);
    const multi = validateAndNormalizeBoundary({
      type: 'MultiPolygon',
      coordinates: [polygon.coordinates],
    });
    expect(isPointInBoundary(6.685, -1.625, multi.boundary)).toBe(true);
    expect(
      isInsideBoundingBox(
        { latitude: 6.685, longitude: -1.625 },
        normalized.boundingBox,
      ),
    ).toBe(true);
  });
});

describe('refund policy', () => {
  it('requests fee refund for pre-accept cancel and late payment, never for unpaid timeout', () => {
    expect(
      decideRefunds({
        feeCaptured: true,
        tokenDebited: false,
        situation: 'PASSENGER_CANCEL_BEFORE_ACCEPT',
      }).fee,
    ).toBe('REQUEST_REFUND');
    expect(
      decideRefunds({
        feeCaptured: true,
        tokenDebited: false,
        situation: 'LATE_PAYMENT_AFTER_DEADLINE',
      }).fee,
    ).toBe('REQUEST_REFUND');
    expect(
      decideRefunds({
        feeCaptured: false,
        tokenDebited: false,
        situation: 'UNPAID_TIMEOUT',
      }).fee,
    ).toBe('NONE');
    expect(BOOKING_FEE_PESEWAS).toBe(100);
  });

  it('refunds fee and token for rider cancel / unable-to-complete, never auto for passenger post-accept', () => {
    expect(
      decideRefunds({
        feeCaptured: true,
        tokenDebited: true,
        situation: 'RIDER_CANCEL_AFTER_ACCEPT',
      }),
    ).toEqual({ fee: 'REQUEST_REFUND', token: 'REQUEST_REFUND' });
    expect(
      decideRefunds({
        feeCaptured: true,
        tokenDebited: true,
        situation: 'RIDER_UNABLE_TO_COMPLETE',
      }),
    ).toEqual({ fee: 'REQUEST_REFUND', token: 'REQUEST_REFUND' });
    expect(
      decideRefunds({
        feeCaptured: true,
        tokenDebited: true,
        situation: 'PASSENGER_CANCEL_AFTER_ACCEPT',
      }),
    ).toEqual({ fee: 'NONE', token: 'NONE' });
    expect(
      decideRefunds({
        feeCaptured: true,
        tokenDebited: false,
        situation: 'COMPLETED',
      }),
    ).toEqual({ fee: 'NONE', token: 'NONE' });
    expect(
      decideRefunds({
        feeCaptured: true,
        tokenDebited: false,
        situation: 'PAYMENT_FAILED',
      }),
    ).toEqual({ fee: 'NONE', token: 'NONE' });
  });

  it('maps terminal bookings to matrix situations for sweeper recovery', () => {
    expect(
      situationForMissingFeeRefund({
        status: 'EXPIRED',
        acceptedAt: null,
        cancellationActorType: null,
      }),
    ).toBe('SEARCH_EXPIRED');
    expect(
      situationForMissingFeeRefund({
        status: 'CANCELLED',
        acceptedAt: null,
        cancellationActorType: 'PASSENGER',
      }),
    ).toBe('PASSENGER_CANCEL_BEFORE_ACCEPT');
    expect(
      situationForMissingFeeRefund({
        status: 'CANCELLED',
        acceptedAt: new Date(),
        cancellationActorType: 'PASSENGER',
      }),
    ).toBe('PASSENGER_CANCEL_AFTER_ACCEPT');
    expect(
      situationForMissingFeeRefund({
        status: 'CANCELLED',
        acceptedAt: new Date(),
        cancellationActorType: 'RIDER',
        statusHistoryReasons: [{ toStatus: 'CANCELLED', reason: 'rider_unable_to_complete' }],
      }),
    ).toBe('RIDER_UNABLE_TO_COMPLETE');
    expect(
      situationForMissingFeeRefund({
        status: 'CANCELLED',
        acceptedAt: new Date(),
        cancellationActorType: 'ADMIN',
      }),
    ).toBeNull();
    expect(
      situationForMissingFeeRefund({
        status: 'PAYMENT_FAILED',
        acceptedAt: null,
        cancellationActorType: null,
      }),
    ).toBe('PAYMENT_FAILED');
  });
});

describe('paystack memory client', () => {
  it('initializes with server-owned amount only', async () => {
    const client = new MemoryPaystackClient();
    const result = await client.initializeTransaction({
      email: 'passenger+x@payments.cyrlo.local',
      amountPesewas: 100,
      currency: 'GHS',
      reference: `bf_${randomUUID().replace(/-/g, '')}`,
    });
    expect(result.authorizationUrl).toContain('checkout.paystack.com');
    expect(client.initializations[0]?.amountPesewas).toBe(100);
  });
});
