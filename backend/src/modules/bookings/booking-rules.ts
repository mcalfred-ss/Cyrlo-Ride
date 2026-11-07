import { TOKEN_COST_PER_ACCEPTANCE } from '../../config/constants.js';
import { AppError } from '../../common/errors/app-error.js';

/** Approved booking lifecycle (master spec). REQUESTED is retired. */
export const BookingStatus = {
  AwaitingPayment: 'AWAITING_PAYMENT',
  PaymentFailed: 'PAYMENT_FAILED',
  Searching: 'SEARCHING',
  Accepted: 'ACCEPTED',
  InProgress: 'IN_PROGRESS',
  Completed: 'COMPLETED',
  Expired: 'EXPIRED',
  Cancelled: 'CANCELLED',
} as const;

export type BookingStatus = (typeof BookingStatus)[keyof typeof BookingStatus];

export const BookingOfferStatus = {
  Pending: 'PENDING',
  Accepted: 'ACCEPTED',
  Rejected: 'REJECTED',
  TimedOut: 'TIMED_OUT',
  Invalidated: 'INVALIDATED',
  Expired: 'EXPIRED',
  Cancelled: 'CANCELLED',
} as const;

export type BookingOfferStatus = (typeof BookingOfferStatus)[keyof typeof BookingOfferStatus];

export const BookingActor = {
  Passenger: 'PASSENGER',
  Rider: 'RIDER',
  Admin: 'ADMIN',
  System: 'SYSTEM',
} as const;

export type BookingActor = (typeof BookingActor)[keyof typeof BookingActor];

const bookingTransitions: Record<
  BookingStatus,
  Partial<Record<BookingStatus, readonly BookingActor[]>>
> = {
  AWAITING_PAYMENT: {
    SEARCHING: ['SYSTEM'],
    PAYMENT_FAILED: ['SYSTEM'],
    CANCELLED: ['PASSENGER', 'ADMIN', 'SYSTEM'],
  },
  PAYMENT_FAILED: {},
  SEARCHING: {
    ACCEPTED: ['RIDER'],
    EXPIRED: ['SYSTEM'],
    CANCELLED: ['PASSENGER', 'ADMIN', 'SYSTEM'],
  },
  ACCEPTED: {
    IN_PROGRESS: ['RIDER'],
    CANCELLED: ['PASSENGER', 'RIDER', 'ADMIN', 'SYSTEM'],
  },
  IN_PROGRESS: {
    COMPLETED: ['RIDER'],
    CANCELLED: ['RIDER', 'ADMIN', 'SYSTEM'],
  },
  COMPLETED: {},
  EXPIRED: {},
  CANCELLED: {},
};

const offerTransitions: Record<
  BookingOfferStatus,
  Partial<Record<BookingOfferStatus, readonly BookingActor[]>>
> = {
  PENDING: {
    ACCEPTED: ['RIDER'],
    REJECTED: ['RIDER'],
    TIMED_OUT: ['SYSTEM'],
    INVALIDATED: ['SYSTEM'],
    EXPIRED: ['SYSTEM'],
    CANCELLED: ['PASSENGER', 'ADMIN', 'SYSTEM'],
  },
  ACCEPTED: {},
  REJECTED: {},
  TIMED_OUT: {},
  INVALIDATED: {},
  EXPIRED: {},
  CANCELLED: {},
};

function assertTransition<Status extends string>(
  table: Partial<Record<Status, readonly BookingActor[]>> | undefined,
  from: Status,
  to: Status,
  actor: BookingActor,
  noun: string,
): void {
  const actors = table?.[to];
  if (!actors) {
    throw new AppError({
      status: 409,
      code: 'CONFLICT',
      message: `${noun} cannot move from ${from} to ${to}`,
    });
  }
  if (!actors.includes(actor)) {
    throw new AppError({
      status: 403,
      code: 'FORBIDDEN',
      message: `${actor} cannot move a ${noun.toLowerCase()} from ${from} to ${to}`,
    });
  }
}

export function assertBookingTransition(
  from: BookingStatus,
  to: BookingStatus,
  actor: BookingActor,
): void {
  assertTransition(bookingTransitions[from], from, to, actor, 'Booking');
}

export function assertOfferTransition(
  from: BookingOfferStatus,
  to: BookingOfferStatus,
  actor: BookingActor,
): void {
  assertTransition(offerTransitions[from], from, to, actor, 'Offer');
}

export const acceptanceTokenDelta = -TOKEN_COST_PER_ACCEPTANCE;

export type FeeRefundDecision = 'NONE' | 'REQUEST_REFUND';
export type TokenRefundDecision = 'NONE' | 'REQUEST_REFUND';

/**
 * Approved cancellation/refund matrix (fee and token decided independently).
 * Replaces the legacy boolean helpers for new code paths.
 */
export function decideRefunds(input: {
  feeCaptured: boolean;
  tokenDebited: boolean;
  situation:
    | 'PASSENGER_CANCEL_BEFORE_ACCEPT'
    | 'SEARCH_EXPIRED'
    | 'UNPAID_TIMEOUT'
    | 'PAYMENT_FAILED'
    | 'LATE_PAYMENT_AFTER_DEADLINE'
    | 'PASSENGER_CANCEL_AFTER_ACCEPT'
    | 'RIDER_CANCEL_AFTER_ACCEPT'
    | 'RIDER_UNABLE_TO_COMPLETE'
    | 'COMPLETED';
}): { fee: FeeRefundDecision; token: TokenRefundDecision } {
  switch (input.situation) {
    case 'PASSENGER_CANCEL_BEFORE_ACCEPT':
    case 'SEARCH_EXPIRED':
      return {
        fee: input.feeCaptured ? 'REQUEST_REFUND' : 'NONE',
        token: 'NONE',
      };
    case 'LATE_PAYMENT_AFTER_DEADLINE':
      return {
        fee: input.feeCaptured ? 'REQUEST_REFUND' : 'NONE',
        token: 'NONE',
      };
    case 'UNPAID_TIMEOUT':
    case 'PAYMENT_FAILED':
      return { fee: 'NONE', token: 'NONE' };
    case 'RIDER_CANCEL_AFTER_ACCEPT':
    case 'RIDER_UNABLE_TO_COMPLETE':
      // Approved matrix: fee refund + token reversal (immutable originals + compensating rows).
      return {
        fee: input.feeCaptured ? 'REQUEST_REFUND' : 'NONE',
        token: input.tokenDebited ? 'REQUEST_REFUND' : 'NONE',
      };
    case 'PASSENGER_CANCEL_AFTER_ACCEPT':
    case 'COMPLETED':
      return { fee: 'NONE', token: 'NONE' };
    default:
      return { fee: 'NONE', token: 'NONE' };
  }
}

/**
 * @deprecated Legacy boolean used by older domain tests. Prefer `decideRefunds`.
 * Does not encode rider-cancel token refunds correctly.
 */
export function shouldRefundBookingFee(input: {
  feeCaptured: boolean;
  nextStatus: BookingStatus | string;
  riderAccepted: boolean;
}): boolean {
  if (!input.feeCaptured || input.riderAccepted) return false;
  return input.nextStatus === 'CANCELLED' || input.nextStatus === 'EXPIRED';
}

/**
 * @deprecated Prefer `decideRefunds`. Approved policy refunds the token when the rider cancels.
 */
export function shouldRefundToken(input: {
  tokenDebited: boolean;
  nextStatus: BookingStatus | string;
  cancelledBy?: BookingActor;
}): boolean {
  if (!input.tokenDebited || input.nextStatus !== 'CANCELLED') return false;
  return input.cancelledBy !== 'RIDER';
}
