import { describe, expect, it } from 'vitest';

import { canApproveApplication, summarizeVehicleReviews } from './vehicleProgress';

describe('vehicleProgress', () => {
  it('summarizes vehicle review statuses', () => {
    expect(
      summarizeVehicleReviews([
        { verificationStatus: 'PENDING_REVIEW' },
        { verificationStatus: 'APPROVED' },
        { verificationStatus: 'REJECTED' },
        { verificationStatus: 'DRAFT' },
      ]),
    ).toEqual({ total: 4, pending: 1, approved: 1, rejected: 1, other: 1 });
  });

  it('only allows application approval when none pending and at least one approved', () => {
    expect(
      canApproveApplication([
        { verificationStatus: 'APPROVED' },
        { verificationStatus: 'REJECTED' },
      ]),
    ).toBe(true);
    expect(canApproveApplication([{ verificationStatus: 'PENDING_REVIEW' }])).toBe(false);
    expect(canApproveApplication([{ verificationStatus: 'REJECTED' }])).toBe(false);
  });
});
