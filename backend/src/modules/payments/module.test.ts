import { createHmac } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { env } from '../../config/env.js';
import { verifyPaystackSignature } from '../../infrastructure/payments/paystack.js';
import { initiateBookingFeeSchema } from './module.schema.js';

describe('payments module schemas', () => {
  it('accepts only bookingId for fee initiation', () => {
    expect(initiateBookingFeeSchema.safeParse({ bookingId: 'not-uuid' }).success).toBe(false);
    expect(
      initiateBookingFeeSchema.safeParse({
        bookingId: '11111111-1111-1111-1111-111111111111',
        amountPesewas: 50,
      }).success,
    ).toBe(false);
    expect(
      initiateBookingFeeSchema.safeParse({
        bookingId: '11111111-1111-1111-1111-111111111111',
      }).success,
    ).toBe(true);
  });
});

describe('paystack signature', () => {
  it('rejects missing or wrong signatures', () => {
    const body = Buffer.from('{"event":"charge.success"}');
    const good = createHmac('sha512', env.PAYSTACK_SECRET_KEY).update(body).digest('hex');
    expect(verifyPaystackSignature(body, good, env.PAYSTACK_SECRET_KEY)).toBe(true);
    expect(verifyPaystackSignature(body, undefined, env.PAYSTACK_SECRET_KEY)).toBe(false);
    expect(verifyPaystackSignature(body, good, 'other')).toBe(false);
  });
});
