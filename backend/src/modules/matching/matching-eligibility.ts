import {
  evaluateOperationalEligibility,
  IneligibilityReason,
  type IneligibilityReason as Reason,
  type OperationalEligibilitySnapshot,
} from '../riders/operational-eligibility.js';
import { haversineDistanceMeters, isWithinMatchingRadius } from './geo-distance.js';

export interface MatchingEligibilitySnapshot extends OperationalEligibilitySnapshot {
  tokenBalance: number;
  hasApprovedVehicleForCategory: boolean;
  hasApprovedActiveZoneForPickup: boolean;
  previouslyExcludedFromBooking: boolean;
  location:
    | (OperationalEligibilitySnapshot['location'] & {
        latitude: number;
        longitude: number;
      })
    | null;
  pickup: { latitude: number; longitude: number };
}

export interface MatchingEligibilityResult {
  eligible: boolean;
  reasons: Reason[];
  distanceMeters: number | null;
}

/**
 * Booking-specific matching gate on top of operational eligibility.
 */
export function evaluateMatchingEligibility(
  snapshot: MatchingEligibilitySnapshot,
  now?: Date,
): MatchingEligibilityResult {
  const base = evaluateOperationalEligibility(
    {
      ...snapshot,
      hasApprovedVehicle: snapshot.hasApprovedVehicleForCategory,
      hasApprovedActiveZone: snapshot.hasApprovedActiveZoneForPickup,
    },
    { now, requireOnline: true },
  );
  const reasons: Reason[] = [...base.reasons];
  let distanceMeters: number | null = null;

  if (snapshot.onActiveTrip) {
    reasons.push(IneligibilityReason.ON_ACTIVE_TRIP);
  }
  if (!snapshot.hasApprovedVehicleForCategory) {
    reasons.push(IneligibilityReason.WRONG_VEHICLE_CATEGORY);
  }
  if (snapshot.tokenBalance < 1) {
    reasons.push(IneligibilityReason.INSUFFICIENT_TOKENS);
  }
  if (snapshot.previouslyExcludedFromBooking) {
    reasons.push(IneligibilityReason.PREVIOUSLY_EXCLUDED_FROM_BOOKING);
  }

  if (snapshot.location) {
    try {
      distanceMeters = haversineDistanceMeters(
        {
          latitude: snapshot.location.latitude,
          longitude: snapshot.location.longitude,
        },
        snapshot.pickup,
      );
      if (
        !isWithinMatchingRadius(
          {
            latitude: snapshot.location.latitude,
            longitude: snapshot.location.longitude,
          },
          snapshot.pickup,
        )
      ) {
        reasons.push(IneligibilityReason.OUTSIDE_MATCHING_RADIUS);
      }
    } catch {
      reasons.push(IneligibilityReason.OUTSIDE_MATCHING_RADIUS);
    }
  }

  return {
    eligible: reasons.length === 0,
    reasons: [...new Set(reasons)],
    distanceMeters,
  };
}
