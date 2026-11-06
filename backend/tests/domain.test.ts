import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { IdempotencyKey } from '../src/common/utils/idempotency.js';
import { canAttemptOtp, isOtpExpired } from '../src/common/security/otp.js';
import { hashSecretValue, signAccessToken, verifyAccessToken } from '../src/common/security/tokens.js';
import { env, loadEnv } from '../src/config/env.js';
import { verifyPaystackSignature } from '../src/infrastructure/payments/paystack.js';
import {
  acceptanceTokenDelta,
  assertBookingTransition,
  assertOfferTransition,
  shouldRefundBookingFee,
  shouldRefundToken,
} from '../src/modules/bookings/booking-rules.js';
import { isFreshLocation } from '../src/modules/locations/location-freshness.js';
import { isInsideBoundingBox, isPointInRing } from '../src/modules/service-zones/zone-geometry.js';

const baseEnv = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://cyrlo:cyrlo@127.0.0.1:5432/cyrlo_ride?schema=public',
  JWT_ACCESS_SECRET: 'test-only-access-secret-value-0123456789',
  JWT_REFRESH_SECRET: 'test-only-refresh-secret-value-0123456789',
  OTP_HASH_SECRET: 'test-only-otp-hash-secret-value-0123456789',
};

describe('environment', () => {
  it('rejects a missing database url', () => {
    expect(() => loadEnv({ NODE_ENV: 'test' })).toThrow(/DATABASE_URL/);
  });

  it('rejects reused development secrets in production', () => {
    expect(() =>
      loadEnv({
        ...baseEnv,
        NODE_ENV: 'production',
        JWT_ACCESS_SECRET: 'development-only-access-secret-change-me',
        JWT_REFRESH_SECRET: 'development-only-refresh-secret-change-me',
        OTP_HASH_SECRET: 'development-only-otp-hash-secret-change-me',
      }),
    ).toThrow(/development placeholder/);
  });
});

describe('security helpers', () => {
  it('round-trips an access token and rejects another secret', () => {
    const token = signAccessToken(
      { sub: 'user-1', role: 'PASSENGER' },
      env.JWT_ACCESS_SECRET,
      60,
    );
    expect(verifyAccessToken(token, env.JWT_ACCESS_SECRET)).toMatchObject({
      sub: 'user-1',
      role: 'PASSENGER',
    });
    expect(() => verifyAccessToken(token, env.JWT_REFRESH_SECRET)).toThrow(/invalid or expired/);
  });

  it('verifies a Paystack signature against the raw body', () => {
    const secret = 'paystack-test-secret';
    const body = Buffer.from(JSON.stringify({ event: 'charge.success' }));
    const signature = createHmac('sha512', secret).update(body).digest('hex');
    expect(verifyPaystackSignature(body, signature, secret)).toBe(true);
    expect(verifyPaystackSignature(body, signature, 'other-secret')).toBe(false);
    expect(verifyPaystackSignature(body, 'short', secret)).toBe(false);
  });

  it('expires OTP codes and stops after the attempt limit', () => {
    const now = new Date('2026-11-06T12:00:00.000Z');
    expect(isOtpExpired(new Date('2026-11-06T11:59:00.000Z'), now)).toBe(true);
    expect(isOtpExpired(new Date('2026-11-06T12:05:00.000Z'), now)).toBe(false);
    expect(canAttemptOtp(4, 5)).toBe(true);
    expect(canAttemptOtp(5, 5)).toBe(false);
    expect(hashSecretValue('123456', 'pepper')).toHaveLength(64);
  });
});

describe('booking rules', () => {
  it('allows a rider to accept and complete, and keeps terminal states closed', () => {
    expect(() => assertBookingTransition('REQUESTED', 'ACCEPTED', 'RIDER')).not.toThrow();
    expect(() => assertBookingTransition('ACCEPTED', 'COMPLETED', 'RIDER')).not.toThrow();
    expect(() => assertBookingTransition('REQUESTED', 'ACCEPTED', 'PASSENGER')).toThrow(/cannot move/);
    expect(() => assertBookingTransition('COMPLETED', 'CANCELLED', 'ADMIN')).toThrow(/cannot move/);
    expect(acceptanceTokenDelta).toBe(-1);
  });

  it('treats a rider rejection as an offer outcome, not a closed booking', () => {
    expect(() => assertOfferTransition('PENDING', 'REJECTED', 'RIDER')).not.toThrow();
    expect(() => assertOfferTransition('PENDING', 'ACCEPTED', 'RIDER')).not.toThrow();
  });

  it('refunds the booking fee only before a rider accepts', () => {
    expect(shouldRefundBookingFee({ feeCaptured: true, nextStatus: 'EXPIRED', riderAccepted: false })).toBe(true);
    expect(shouldRefundBookingFee({ feeCaptured: true, nextStatus: 'CANCELLED', riderAccepted: true })).toBe(false);
    expect(shouldRefundBookingFee({ feeCaptured: false, nextStatus: 'EXPIRED', riderAccepted: false })).toBe(false);
  });

  it('refunds a token unless the rider cancels or the ride completes', () => {
    expect(shouldRefundToken({ tokenDebited: true, nextStatus: 'CANCELLED', cancelledBy: 'PASSENGER' })).toBe(true);
    expect(shouldRefundToken({ tokenDebited: true, nextStatus: 'CANCELLED', cancelledBy: 'RIDER' })).toBe(false);
    expect(shouldRefundToken({ tokenDebited: true, nextStatus: 'COMPLETED', cancelledBy: 'RIDER' })).toBe(false);
    expect(IdempotencyKey.tokenDebit('booking-1')).toBe('token-debit:booking:booking-1');
    expect(IdempotencyKey.tokenRefund('booking-1')).not.toBe(IdempotencyKey.tokenDebit('booking-1'));
  });
});

describe('location and zones', () => {
  const now = new Date('2026-11-06T12:00:00.000Z');

  it('rejects stale and future GPS readings', () => {
    expect(isFreshLocation(new Date('2026-11-06T11:59:50.000Z'), now, 30_000)).toBe(true);
    expect(isFreshLocation(new Date('2026-11-06T11:59:00.000Z'), now, 30_000)).toBe(false);
    expect(isFreshLocation(new Date('2026-11-06T12:00:05.000Z'), now, 30_000)).toBe(false);
  });

  it('tests a pickup against a bounding box and a GeoJSON ring', () => {
    const box = { minLatitude: 5.5, maxLatitude: 5.7, minLongitude: -0.3, maxLongitude: 0 };
    expect(isInsideBoundingBox({ latitude: 5.6, longitude: -0.2 }, box)).toBe(true);
    expect(isInsideBoundingBox({ latitude: 5.9, longitude: -0.2 }, box)).toBe(false);
    const ring = [
      [-0.3, 5.5],
      [0, 5.5],
      [0, 5.7],
      [-0.3, 5.7],
      [-0.3, 5.5],
    ] as const;
    expect(isPointInRing(5.6, -0.2, ring)).toBe(true);
    expect(isPointInRing(5.9, -0.2, ring)).toBe(false);
  });
});
