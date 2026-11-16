import { describe, expect, it } from 'vitest';

import { rangeForPreset, toDatetimeLocalValue } from './dateRange';

describe('rangeForPreset', () => {
  const now = new Date('2026-11-12T15:30:00');

  it('omits from/to for all-time', () => {
    expect(rangeForPreset('all', now)).toEqual({ preset: 'all' });
  });

  it('builds inclusive local-day bounds for today as ISO strings', () => {
    const range = rangeForPreset('today', now);
    expect(range.from).toBeDefined();
    expect(range.to).toBeDefined();
    expect(new Date(range.from!).getHours() + new Date(range.from!).getMinutes()).toBe(0);
  });

  it('covers 7 inclusive local days', () => {
    const range = rangeForPreset('7d', now);
    const from = new Date(range.from!);
    const to = new Date(range.to!);
    const dayMs = 24 * 60 * 60 * 1000;
    expect((to.getTime() - from.getTime()) / dayMs).toBeGreaterThan(6);
    expect((to.getTime() - from.getTime()) / dayMs).toBeLessThan(7);
  });
});

describe('toDatetimeLocalValue', () => {
  it('formats without timezone suffix', () => {
    const value = toDatetimeLocalValue(new Date(2026, 10, 12, 9, 5));
    expect(value).toBe('2026-11-12T09:05');
  });
});
