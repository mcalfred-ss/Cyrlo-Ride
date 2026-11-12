import { describe, expect, it } from 'vitest';

import { formatGhsFromPesewas } from './money';

describe('formatGhsFromPesewas', () => {
  it('formats the GH₵1 connection fee unit', () => {
    expect(formatGhsFromPesewas(100)).toBe('GH₵1.00');
  });

  it('formats zero and larger amounts without inventing floats in the source data', () => {
    expect(formatGhsFromPesewas(0)).toBe('GH₵0.00');
    expect(formatGhsFromPesewas(12_550)).toBe('GH₵125.50');
  });
});
