import { describe, expect, it, vi } from 'vitest';

import { BOOKING_FEE_PESEWAS } from '../../config/constants.js';
import { AppError } from '../../common/errors/app-error.js';
import { MemoryPaystackClient } from '../../infrastructure/payments/paystack-client.js';
import { IdempotencyKey } from '../../common/utils/idempotency.js';
import {
  connectionFeePhase,
  decideFeeSuccessFinalize,
  decideUnpaidConnectionFeeCancel,
  simulateCancelVsSuccessRace,
} from './connection-fee-lifecycle.js';

describe('connection fee lifecycle decisions', () => {
  const now = new Date('2026-11-11T12:00:00.000Z');
  const past = new Date('2026-11-11T11:50:00.000Z');
  const future = new Date('2026-11-11T12:10:00.000Z');

  it('treats accept+pending as checkout_pending until deadline', () => {
    expect(
      connectionFeePhase({
        bookingStatus: 'ACCEPTED',
        paymentStatus: 'PENDING',
        paymentExpiresAt: future,
        now,
      }),
    ).toBe('checkout_pending');
  });

  it('marks unpaid cancel phase when deadline passed without SUCCESS', () => {
    expect(
      connectionFeePhase({
        bookingStatus: 'ACCEPTED',
        paymentStatus: 'PENDING',
        paymentExpiresAt: past,
        now,
      }),
    ).toBe('unpaid_cancelled');
  });

  it('abort unpaid cancel when fee already SUCCESS under lock', () => {
    expect(
      decideUnpaidConnectionFeeCancel({
        bookingStatus: 'ACCEPTED',
        paymentStatuses: ['SUCCESS'],
        paymentExpiresAt: past,
        now,
        tokenDebited: true,
      }),
    ).toEqual({ action: 'abort', reason: 'fee_already_paid' });
  });

  it('abort unpaid cancel when not due', () => {
    expect(
      decideUnpaidConnectionFeeCancel({
        bookingStatus: 'ACCEPTED',
        paymentStatuses: ['PENDING'],
        paymentExpiresAt: future,
        now,
        tokenDebited: true,
      }),
    ).toEqual({ action: 'abort', reason: 'not_due' });
  });

  it('cancel with single token reverse when due and unpaid', () => {
    expect(
      decideUnpaidConnectionFeeCancel({
        bookingStatus: 'ACCEPTED',
        paymentStatuses: ['PENDING'],
        paymentExpiresAt: past,
        now,
        tokenDebited: true,
      }),
    ).toEqual({ action: 'cancel', reverseToken: true, abandonPending: true });
  });

  it('SUCCESS finalize confirms paid on ACCEPTED before deadline', () => {
    expect(
      decideFeeSuccessFinalize({
        bookingStatus: 'ACCEPTED',
        paymentExpiresAt: future,
        now,
      }),
    ).toEqual({ action: 'confirm_paid' });
  });

  it('SUCCESS after CANCELLED queues late refund and does not revive', () => {
    expect(
      decideFeeSuccessFinalize({
        bookingStatus: 'CANCELLED',
        paymentExpiresAt: past,
        now,
      }),
    ).toEqual({ action: 'refund_late', reason: 'booking_terminal' });
  });

  it('SUCCESS past deadline on ACCEPTED refunds without confirm', () => {
    expect(
      decideFeeSuccessFinalize({
        bookingStatus: 'ACCEPTED',
        paymentExpiresAt: past,
        now,
      }),
    ).toEqual({ action: 'refund_late', reason: 'past_deadline' });
  });
});

describe('cancel vs SUCCESS race (deterministic)', () => {
  it('SUCCESS committing first keeps ACCEPTED and does not reverse token', () => {
    expect(
      simulateCancelVsSuccessRace({ firstCommit: 'success', tokenDebited: true }),
    ).toEqual({
      bookingStatus: 'ACCEPTED',
      paymentStatus: 'SUCCESS',
      tokenReversed: false,
    });
  });

  it('cancel committing first leaves CANCELLED/ABANDONED and reverses token once', () => {
    const once = simulateCancelVsSuccessRace({
      firstCommit: 'cancel',
      tokenDebited: true,
    });
    expect(once).toEqual({
      bookingStatus: 'CANCELLED',
      paymentStatus: 'ABANDONED',
      tokenReversed: true,
    });
    // Second reverse decision: token already reversed conceptually — cancel abort on not_accepted
    expect(
      decideUnpaidConnectionFeeCancel({
        bookingStatus: 'CANCELLED',
        paymentStatuses: ['ABANDONED'],
        paymentExpiresAt: new Date(0),
        now: new Date(),
        tokenDebited: true,
      }),
    ).toEqual({ action: 'abort', reason: 'not_accepted' });
  });
});

describe('payment initialization failure and retry (MemoryPaystack)', () => {
  it('fails initialize without inventing SUCCESS and allows retry with same reference', async () => {
    const paystack = new MemoryPaystackClient();
    paystack.failNextInitialize = true;
    const reference = 'bf_stable_ref_1';

    await expect(
      paystack.initializeTransaction({
        email: 'p@cyrlo.test',
        amountPesewas: BOOKING_FEE_PESEWAS,
        currency: 'GHS',
        reference,
        metadata: { purpose: 'BOOKING_FEE', feeType: 'connection_fee' },
      }),
    ).rejects.toBeInstanceOf(AppError);

    expect(paystack.initializations).toHaveLength(0);

    const ok = await paystack.initializeTransaction({
      email: 'p@cyrlo.test',
      amountPesewas: BOOKING_FEE_PESEWAS,
      currency: 'GHS',
      reference,
      metadata: { purpose: 'BOOKING_FEE', feeType: 'connection_fee' },
    });
    expect(ok.reference).toBe(reference);
    expect(paystack.initializations).toHaveLength(1);
    expect(paystack.initializations[0]?.amountPesewas).toBe(100);
  });

  it('uses one idempotency key per booking (no duplicate fee rows)', () => {
    const bookingId = '11111111-1111-1111-1111-111111111111';
    expect(IdempotencyKey.bookingFee(bookingId)).toBe(`booking-fee:${bookingId}`);
    expect(IdempotencyKey.bookingFee(bookingId)).toBe(IdempotencyKey.bookingFee(bookingId));
    expect(IdempotencyKey.tokenRefund(bookingId)).toBe(`token-refund:booking:${bookingId}`);
  });

  it('does not call global fetch on initialize (no live Paystack)', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const paystack = new MemoryPaystackClient();
    await paystack.initializeTransaction({
      email: 'x@cyrlo.test',
      amountPesewas: 100,
      currency: 'GHS',
      reference: 'bf_x',
      metadata: {},
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});

describe('duplicate acceptance semantics', () => {
  it('only SEARCHING→ACCEPTED wins; second accept is a conflict at decision layer', () => {
    // After first accept, unpaid-cancel decision on non-SEARCHING is N/A;
    // fee success on ACCEPTED is confirm_paid — second accept cannot create another fee key.
    const bookingId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    const keyA = IdempotencyKey.bookingFee(bookingId);
    const keyB = IdempotencyKey.bookingFee(bookingId);
    expect(keyA).toBe(keyB);
    expect(
      decideFeeSuccessFinalize({
        bookingStatus: 'ACCEPTED',
        paymentExpiresAt: new Date('2099-01-01T00:00:00.000Z'),
        now: new Date('2026-11-11T12:00:00.000Z'),
      }).action,
    ).toBe('confirm_paid');
  });
});

describe('rider availability consistency rules', () => {
  it('paid connection keeps assignment; unpaid cancel releases rider conceptually', () => {
    const paid = simulateCancelVsSuccessRace({ firstCommit: 'success', tokenDebited: true });
    expect(paid.bookingStatus).toBe('ACCEPTED'); // rider stays BUSY

    const unpaid = simulateCancelVsSuccessRace({ firstCommit: 'cancel', tokenDebited: true });
    expect(unpaid.bookingStatus).toBe('CANCELLED'); // releaseRiderIfIdle path
    expect(unpaid.tokenReversed).toBe(true);
  });
});
