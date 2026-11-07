/**
 * Verification subset used by onboarding views.
 * Full operational checks live in `operational-eligibility.ts` (zones, GPS, online).
 * Token balance remains deferred to the financial/matching milestone.
 */
export function isVerificationEligible(input: {
  userStatus: 'ACTIVE' | 'SUSPENDED' | 'DELETED';
  riderVerificationStatus: 'DRAFT' | 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED';
  hasApprovedVehicle: boolean;
}): boolean {
  if (input.userStatus !== 'ACTIVE') return false;
  if (input.riderVerificationStatus !== 'APPROVED') return false;
  if (!input.hasApprovedVehicle) return false;
  return true;
}
