import { isOperationallyFreshLocation } from '../locations/location-freshness.js';
import { isVerificationEligible } from './eligibility.js';

/**
 * Structured ineligibility codes for go-online and future matching.
 * Token balance is intentionally omitted until the financial/matching milestone.
 */
export const IneligibilityReason = {
  ACCOUNT_NOT_ACTIVE: 'ACCOUNT_NOT_ACTIVE',
  RIDER_NOT_APPROVED: 'RIDER_NOT_APPROVED',
  NO_APPROVED_VEHICLE: 'NO_APPROVED_VEHICLE',
  NO_APPROVED_ACTIVE_ZONE: 'NO_APPROVED_ACTIVE_ZONE',
  NO_LOCATION: 'NO_LOCATION',
  GPS_NOT_SHARING: 'GPS_NOT_SHARING',
  GPS_NOT_FRESH: 'GPS_NOT_FRESH',
  NOT_ONLINE: 'NOT_ONLINE',
  ON_ACTIVE_TRIP: 'ON_ACTIVE_TRIP',
  /** Matching-only extensions (Milestone 7). */
  OUTSIDE_MATCHING_RADIUS: 'OUTSIDE_MATCHING_RADIUS',
  INSUFFICIENT_TOKENS: 'INSUFFICIENT_TOKENS',
  WRONG_VEHICLE_CATEGORY: 'WRONG_VEHICLE_CATEGORY',
  PREVIOUSLY_EXCLUDED_FROM_BOOKING: 'PREVIOUSLY_EXCLUDED_FROM_BOOKING',
} as const;

export type IneligibilityReason =
  (typeof IneligibilityReason)[keyof typeof IneligibilityReason];

/** Booking statuses that block going offline (approved active-trip rule). */
export const ACTIVE_TRIP_BOOKING_STATUSES = ['ACCEPTED', 'IN_PROGRESS'] as const;

export interface OperationalEligibilitySnapshot {
  userStatus: 'ACTIVE' | 'SUSPENDED' | 'DELETED';
  riderVerificationStatus: 'DRAFT' | 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED';
  hasApprovedVehicle: boolean;
  hasApprovedActiveZone: boolean;
  availability: 'OFFLINE' | 'AVAILABLE' | 'BUSY';
  onActiveTrip: boolean;
  /** Wallet tokens available for accepting jobs. Required to go online. */
  tokenBalance: number;
  location: {
    sharingEnabled: boolean;
    recordedAt: Date;
    receivedAt: Date;
  } | null;
}

export interface OperationalEligibilityResult {
  eligible: boolean;
  reasons: IneligibilityReason[];
  /** True when verification + vehicle + account pass (M3 subset). */
  verificationEligible: boolean;
  onActiveTrip: boolean;
  gpsFresh: boolean;
}

export interface EvaluateOperationalEligibilityOptions {
  now?: Date;
  /**
   * When true (default for matching foundation), rider must be AVAILABLE.
   * Set false when checking prerequisites for going online.
   */
  requireOnline?: boolean;
}

/**
 * Single operational eligibility evaluator for availability and future matching.
 * Does not select, rank, or notify riders.
 */
export function evaluateOperationalEligibility(
  snapshot: OperationalEligibilitySnapshot,
  options: EvaluateOperationalEligibilityOptions = {},
): OperationalEligibilityResult {
  const now = options.now ?? new Date();
  const requireOnline = options.requireOnline !== false;
  const reasons: IneligibilityReason[] = [];

  const verificationEligible = isVerificationEligible({
    userStatus: snapshot.userStatus,
    riderVerificationStatus: snapshot.riderVerificationStatus,
    hasApprovedVehicle: snapshot.hasApprovedVehicle,
  });

  if (snapshot.userStatus !== 'ACTIVE') {
    reasons.push(IneligibilityReason.ACCOUNT_NOT_ACTIVE);
  }
  if (snapshot.riderVerificationStatus !== 'APPROVED') {
    reasons.push(IneligibilityReason.RIDER_NOT_APPROVED);
  }
  if (!snapshot.hasApprovedVehicle) {
    reasons.push(IneligibilityReason.NO_APPROVED_VEHICLE);
  }
  if (!snapshot.hasApprovedActiveZone) {
    reasons.push(IneligibilityReason.NO_APPROVED_ACTIVE_ZONE);
  }

  let gpsFresh = false;
  if (!snapshot.location) {
    reasons.push(IneligibilityReason.NO_LOCATION);
  } else {
    if (!snapshot.location.sharingEnabled) {
      reasons.push(IneligibilityReason.GPS_NOT_SHARING);
    }
    gpsFresh = isOperationallyFreshLocation({
      recordedAt: snapshot.location.recordedAt,
      receivedAt: snapshot.location.receivedAt,
      now,
    });
    if (!gpsFresh) {
      reasons.push(IneligibilityReason.GPS_NOT_FRESH);
    }
  }

  if (requireOnline && snapshot.availability !== 'AVAILABLE') {
    reasons.push(IneligibilityReason.NOT_ONLINE);
  }

  // Active trip does not by itself make a rider ineligible for "on trip" work;
  // it is surfaced for offline protection and matching filters.
  if (snapshot.onActiveTrip && requireOnline) {
    // Matching may still exclude ON_TRIP separately; do not auto-add as ineligible here.
  }

  return {
    eligible: reasons.length === 0,
    reasons: [...new Set(reasons)],
    verificationEligible,
    onActiveTrip: snapshot.onActiveTrip,
    gpsFresh,
  };
}

/** Prerequisites specifically for transitioning to AVAILABLE (online intent). */
export function evaluateGoOnlineEligibility(
  snapshot: OperationalEligibilitySnapshot,
  now?: Date,
): OperationalEligibilityResult {
  const base = evaluateOperationalEligibility(snapshot, { now, requireOnline: false });
  const reasons = [...base.reasons];
  if (snapshot.tokenBalance < 1) {
    reasons.push(IneligibilityReason.INSUFFICIENT_TOKENS);
  }
  const unique = [...new Set(reasons)];
  return {
    ...base,
    eligible: unique.length === 0,
    reasons: unique,
  };
}
