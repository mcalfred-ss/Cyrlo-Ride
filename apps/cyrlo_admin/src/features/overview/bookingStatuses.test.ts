import { describe, expect, it } from 'vitest';

import { bookingStatusRows } from './bookingStatuses';

describe('bookingStatusRows', () => {
  it('zero-fills known statuses and appends unknown keys', () => {
    const rows = bookingStatusRows({ COMPLETED: 3, CUSTOM_STATUS: 1 });
    expect(rows.find((row) => row.status === 'COMPLETED')?.count).toBe(3);
    expect(rows.find((row) => row.status === 'SEARCHING')?.count).toBe(0);
    expect(rows.find((row) => row.status === 'CUSTOM_STATUS')?.count).toBe(1);
  });
});
