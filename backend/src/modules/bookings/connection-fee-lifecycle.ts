/**
 * Destination-free connection-fee lifecycle rules (GH₵1 after rider accept).
 *
 * Explicit outcomes for concurrency between Paystack SUCCESS and unpaid cancel.
 * Pure helpers — no I/O — so race decisions are unit-testable without a database.
 */

export type ConnectionFeePaymentStatus =
  | 'PENDING'
  | 'SUCCESS'
  | 'FAILED'
  | 'ABANDONED';

export type BookingLifecycleStatus =
  | 'SEARCHING'
  | 'ACCEPTED'
  | 'IN_PROGRESS'
  | 'CANCELLED'
  | 'EXPIRED'
  | 'PAYMENT_FAILED'
  | 'COMPLETED'
  | 'AWAITING_PAYMENT';

/** After accept, before / during Paystack checkout. */
export type ConnectionFeePhase =
  | 'awaiting_checkout_init'
  | 'checkout_pending'
  | 'paid'
  | 'unpaid_cancelled'
  | 'late_paid_refund';

export function connectionFeePhase(input: {
  bookingStatus: BookingLifecycleStatus;
  paymentStatus: ConnectionFeePaymentStatus | null;
  paymentExpiresAt: Date | null;
  now: Date;
}): ConnectionFeePhase {
  const { bookingStatus, paymentStatus, paymentExpiresAt, now } = input;
  if (paymentStatus === 'SUCCESS') {
    if (bookingStatus === 'CANCELLED' || bookingStatus === 'PAYMENT_FAILED') {
      return 'late_paid_refund';
    }
    return 'paid';
  }
  if (bookingStatus === 'CANCELLED') {
    return 'unpaid_cancelled';
  }
  if (
    bookingStatus === 'ACCEPTED' &&
    (paymentStatus === null || paymentStatus === 'PENDING' || paymentStatus === 'FAILED')
  ) {
    if (paymentExpiresAt && paymentExpiresAt.getTime() <= now.getTime()) {
      return 'unpaid_cancelled'; // due for cancel
    }
    if (paymentStatus === null || paymentStatus === 'FAILED') {
      return 'awaiting_checkout_init';
    }
    return 'checkout_pending';
  }
  return 'checkout_pending';
}

/**
 * Unpaid-cancel decision after booking (+ fee payment rows) are locked.
 * SUCCESS always wins over stale timeout.
 */
export type UnpaidCancelDecision =
  | { action: 'abort'; reason: 'not_accepted' | 'fee_already_paid' | 'not_due' }
  | { action: 'cancel'; reverseToken: boolean; abandonPending: boolean };

export function decideUnpaidConnectionFeeCancel(input: {
  bookingStatus: BookingLifecycleStatus;
  paymentStatuses: ConnectionFeePaymentStatus[];
  paymentExpiresAt: Date | null;
  now: Date;
  tokenDebited: boolean;
}): UnpaidCancelDecision {
  if (input.bookingStatus !== 'ACCEPTED') {
    return { action: 'abort', reason: 'not_accepted' };
  }
  if (input.paymentStatuses.includes('SUCCESS')) {
    return { action: 'abort', reason: 'fee_already_paid' };
  }
  if (
    input.paymentExpiresAt == null ||
    input.paymentExpiresAt.getTime() > input.now.getTime()
  ) {
    return { action: 'abort', reason: 'not_due' };
  }
  return {
    action: 'cancel',
    reverseToken: input.tokenDebited,
    abandonPending: input.paymentStatuses.includes('PENDING'),
  };
}

/**
 * After payment row is SUCCESS, what to do given current booking status.
 * Never revives CANCELLED / EXPIRED / PAYMENT_FAILED into ACCEPTED/SEARCHING.
 */
export type FeeSuccessFinalizeDecision =
  | { action: 'confirm_paid' }
  | { action: 'refund_late'; reason: 'past_deadline' | 'booking_terminal' }
  | { action: 'noop' }
  | { action: 'legacy_searching' };

export function decideFeeSuccessFinalize(input: {
  bookingStatus: BookingLifecycleStatus;
  paymentExpiresAt: Date | null;
  now: Date;
}): FeeSuccessFinalizeDecision {
  const { bookingStatus, paymentExpiresAt, now } = input;
  if (bookingStatus === 'ACCEPTED' || bookingStatus === 'IN_PROGRESS') {
    const deadline = paymentExpiresAt?.getTime() ?? Number.POSITIVE_INFINITY;
    if (deadline < now.getTime()) {
      return { action: 'refund_late', reason: 'past_deadline' };
    }
    return { action: 'confirm_paid' };
  }
  if (bookingStatus === 'AWAITING_PAYMENT') {
    const onTime =
      paymentExpiresAt != null && paymentExpiresAt.getTime() >= now.getTime();
    return onTime
      ? { action: 'legacy_searching' }
      : { action: 'refund_late', reason: 'past_deadline' };
  }
  if (
    bookingStatus === 'CANCELLED' ||
    bookingStatus === 'PAYMENT_FAILED' ||
    bookingStatus === 'EXPIRED'
  ) {
    return { action: 'refund_late', reason: 'booking_terminal' };
  }
  if (bookingStatus === 'SEARCHING' || bookingStatus === 'COMPLETED') {
    return { action: 'noop' };
  }
  return { action: 'noop' };
}

/** Simulated race: whoever commits SUCCESS on the payment while holding the booking lock wins. */
export function simulateCancelVsSuccessRace(input: {
  /** Order of operations after both have read "PENDING". */
  firstCommit: 'success' | 'cancel';
  tokenDebited: boolean;
}): {
  bookingStatus: 'ACCEPTED' | 'CANCELLED';
  paymentStatus: 'SUCCESS' | 'ABANDONED';
  tokenReversed: boolean;
} {
  if (input.firstCommit === 'success') {
    // Cancel then sees SUCCESS under lock → abort
    return {
      bookingStatus: 'ACCEPTED',
      paymentStatus: 'SUCCESS',
      tokenReversed: false,
    };
  }
  // Cancel commits first → ABANDONED + CANCELLED; late SUCCESS becomes refund path (not revive)
  return {
    bookingStatus: 'CANCELLED',
    paymentStatus: 'ABANDONED',
    tokenReversed: input.tokenDebited,
  };
}
