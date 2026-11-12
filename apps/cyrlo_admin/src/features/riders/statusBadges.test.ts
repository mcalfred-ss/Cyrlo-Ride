import { describe, expect, it } from 'vitest';

import { directoryKindLabel } from './statusBadges';

describe('directoryKindLabel', () => {
  it('labels approved riders distinctly from applicants', () => {
    expect(
      directoryKindLabel({ role: 'RIDER', verificationStatus: 'APPROVED' }),
    ).toBe('Approved rider');
    expect(
      directoryKindLabel({ role: 'PASSENGER', verificationStatus: 'PENDING_REVIEW' }),
    ).toBe('Pending applicant');
    expect(directoryKindLabel({ role: 'PASSENGER', verificationStatus: 'DRAFT' })).toBe(
      'Draft applicant',
    );
    expect(
      directoryKindLabel({ role: 'PASSENGER', verificationStatus: 'REJECTED' }),
    ).toBe('Rejected applicant');
  });
});
