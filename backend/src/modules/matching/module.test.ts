import { describe, expect, it } from 'vitest';

import { MATCHING_RADIUS_METERS } from '../../config/constants.js';
import { AppError } from '../../common/errors/app-error.js';
import {
  IdentityOrderingStrategy,
  StableByRiderIdOrderingStrategy,
} from './candidate-ordering.js';
import { haversineDistanceMeters, isWithinMatchingRadius } from './geo-distance.js';
import { evaluateMatchingEligibility } from './matching-eligibility.js';
import { requireOfferResponseTimeoutSeconds } from './offer-timeout.js';
import { IneligibilityReason } from '../riders/operational-eligibility.js';

describe('haversine matching radius', () => {
  const pickup = { latitude: 6.685, longitude: -1.625 };

  it('includes points clearly inside and exactly at 5 km, excludes just outside', () => {
    const inside = { latitude: 6.685, longitude: -1.62 };
    expect(isWithinMatchingRadius(inside, pickup)).toBe(true);

    // ~5 km north of pickup (approx metres / 111320 degrees latitude).
    const boundary = {
      latitude: pickup.latitude + MATCHING_RADIUS_METERS / 111_320,
      longitude: pickup.longitude,
    };
    expect(haversineDistanceMeters(boundary, pickup)).toBeLessThanOrEqual(MATCHING_RADIUS_METERS + 2);
    expect(isWithinMatchingRadius(boundary, pickup)).toBe(true);

    const outside = {
      latitude: pickup.latitude + (MATCHING_RADIUS_METERS + 50) / 111_320,
      longitude: pickup.longitude,
    };
    expect(isWithinMatchingRadius(outside, pickup)).toBe(false);
  });

  it('handles longitude offsets and rejects invalid coordinates', () => {
    const east = { latitude: 6.685, longitude: -1.58 };
    expect(haversineDistanceMeters(east, pickup)).toBeGreaterThan(0);
    expect(() => haversineDistanceMeters({ latitude: 91, longitude: 0 }, pickup)).toThrow(AppError);
    expect(() => haversineDistanceMeters({ latitude: 0, longitude: 181 }, pickup)).toThrow(AppError);
  });
});

describe('offer timeout configuration', () => {
  it('fails closed when the timeout is not configured', () => {
    expect(() => requireOfferResponseTimeoutSeconds({})).toThrow(/RIDER_OFFER_RESPONSE_TIMEOUT_SECONDS/);
    expect(requireOfferResponseTimeoutSeconds({ RIDER_OFFER_RESPONSE_TIMEOUT_SECONDS: 20 })).toBe(20);
  });
});

describe('candidate ordering', () => {
  it('supports injectable deterministic strategies without claiming product ranking', () => {
    const input = [
      { riderId: 'b', distanceMeters: 100 },
      { riderId: 'a', distanceMeters: 50 },
    ];
    expect(new IdentityOrderingStrategy().order(input).map((r) => r.riderId)).toEqual(['b', 'a']);
    expect(new StableByRiderIdOrderingStrategy().order(input).map((r) => r.riderId)).toEqual([
      'a',
      'b',
    ]);
  });
});

describe('matching eligibility', () => {
  const now = new Date('2026-11-07T12:00:00.000Z');
  const freshLocation = {
    sharingEnabled: true,
    recordedAt: new Date(now.getTime() - 5_000),
    receivedAt: new Date(now.getTime() - 5_000),
    latitude: 6.685,
    longitude: -1.625,
  };
  const pickup = { latitude: 6.685, longitude: -1.625 };

  function base(overrides: Record<string, unknown> = {}) {
    return {
      userStatus: 'ACTIVE' as const,
      riderVerificationStatus: 'APPROVED' as const,
      hasApprovedVehicle: true,
      hasApprovedVehicleForCategory: true,
      hasApprovedActiveZone: true,
      hasApprovedActiveZoneForPickup: true,
      availability: 'AVAILABLE' as const,
      onActiveTrip: false,
      tokenBalance: 1,
      previouslyExcludedFromBooking: false,
      location: freshLocation,
      pickup,
      ...overrides,
    };
  }

  it('includes a fully eligible rider with one token and exact 5 km location', () => {
    const atBoundary = {
      ...freshLocation,
      latitude: pickup.latitude + MATCHING_RADIUS_METERS / 111_320,
    };
    expect(evaluateMatchingEligibility(base({ location: atBoundary }), now).eligible).toBe(true);
  });

  it('excludes unverified, suspended, offline, stale GPS, outside radius, wrong vehicle, unapproved zone, zero tokens, active trip, and prior reject/timeout', () => {
    expect(
      evaluateMatchingEligibility(base({ riderVerificationStatus: 'PENDING_REVIEW' }), now).reasons,
    ).toContain(IneligibilityReason.RIDER_NOT_APPROVED);
    expect(
      evaluateMatchingEligibility(base({ userStatus: 'SUSPENDED' }), now).reasons,
    ).toContain(IneligibilityReason.ACCOUNT_NOT_ACTIVE);
    expect(
      evaluateMatchingEligibility(base({ availability: 'OFFLINE' }), now).reasons,
    ).toContain(IneligibilityReason.NOT_ONLINE);
    expect(
      evaluateMatchingEligibility(
        base({
          location: {
            ...freshLocation,
            recordedAt: new Date(now.getTime() - 60_000),
            receivedAt: new Date(now.getTime() - 60_000),
          },
        }),
        now,
      ).reasons,
    ).toContain(IneligibilityReason.GPS_NOT_FRESH);
    expect(
      evaluateMatchingEligibility(
        base({
          location: {
            ...freshLocation,
            latitude: pickup.latitude + (MATCHING_RADIUS_METERS + 80) / 111_320,
          },
        }),
        now,
      ).reasons,
    ).toContain(IneligibilityReason.OUTSIDE_MATCHING_RADIUS);
    expect(
      evaluateMatchingEligibility(base({ hasApprovedVehicleForCategory: false }), now).reasons,
    ).toContain(IneligibilityReason.WRONG_VEHICLE_CATEGORY);
    expect(
      evaluateMatchingEligibility(base({ hasApprovedActiveZoneForPickup: false }), now).reasons,
    ).toContain(IneligibilityReason.NO_APPROVED_ACTIVE_ZONE);
    expect(evaluateMatchingEligibility(base({ tokenBalance: 0 }), now).reasons).toContain(
      IneligibilityReason.INSUFFICIENT_TOKENS,
    );
    expect(evaluateMatchingEligibility(base({ onActiveTrip: true }), now).reasons).toContain(
      IneligibilityReason.ON_ACTIVE_TRIP,
    );
    expect(
      evaluateMatchingEligibility(base({ previouslyExcludedFromBooking: true }), now).reasons,
    ).toContain(IneligibilityReason.PREVIOUSLY_EXCLUDED_FROM_BOOKING);
  });
});
