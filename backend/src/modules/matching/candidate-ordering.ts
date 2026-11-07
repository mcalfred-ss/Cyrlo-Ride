/**
 * Candidate ordering is an unresolved product decision.
 * Do not treat any production strategy as an approved business ranking
 * (nearest-first, oldest-online, random, etc. are not approved).
 *
 * Implementations must be injectable for tests.
 */
export interface MatchingCandidate {
  riderId: string;
  distanceMeters: number;
}

export interface CandidateOrderingStrategy {
  readonly name: string;
  order(candidates: MatchingCandidate[]): MatchingCandidate[];
}

/**
 * Deterministic, preference-neutral order by riderId.
 * Used so dispatch is stable without claiming a product ranking policy.
 */
export class StableByRiderIdOrderingStrategy implements CandidateOrderingStrategy {
  readonly name = 'stable_by_rider_id';

  order(candidates: MatchingCandidate[]): MatchingCandidate[] {
    return [...candidates].sort((a, b) => a.riderId.localeCompare(b.riderId));
  }
}

/** Test helper: preserve the array order supplied by the test. */
export class IdentityOrderingStrategy implements CandidateOrderingStrategy {
  readonly name = 'identity';

  order(candidates: MatchingCandidate[]): MatchingCandidate[] {
    return [...candidates];
  }
}

export function defaultCandidateOrderingStrategy(): CandidateOrderingStrategy {
  return new StableByRiderIdOrderingStrategy();
}
