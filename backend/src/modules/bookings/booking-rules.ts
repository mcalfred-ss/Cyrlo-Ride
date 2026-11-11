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
export type RefundSituation =
  | 'PASSENGER_CANCEL_BEFORE_ACCEPT'
  | 'SEARCH_EXPIRED'
  | 'UNPAID_TIMEOUT'
  | 'PAYMENT_FAILED'
  | 'LATE_PAYMENT_AFTER_DEADLINE'
  | 'PASSENGER_CANCEL_AFTER_ACCEPT'
  | 'RIDER_CANCEL_AFTER_ACCEPT'
  | 'RIDER_UNABLE_TO_COMPLETE'
  /** Accepted connection but passenger never paid the GH₵1 fee window. */
  | 'CONNECTION_FEE_UNPAID_TIMEOUT'
  | 'COMPLETED';

export function decideRefunds(input: {
  feeCaptured: boolean;
  tokenDebited: boolean;
  situation: RefundSituation;
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
    case 'CONNECTION_FEE_UNPAID_TIMEOUT':
      // Connection never completed — reverse rider token; abandon unpaid fee (no capture).
      return {
        fee: input.feeCaptured ? 'REQUEST_REFUND' : 'NONE',
        token: input.tokenDebited ? 'REQUEST_REFUND' : 'NONE',
      };
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

/** Stable reason strings stored on payment_refunds for matrix-authorized rows. */
export function feeRefundReasonForSituation(situation: RefundSituation): string {
  switch (situation) {
    case 'PASSENGER_CANCEL_BEFORE_ACCEPT':
      return 'passenger_cancel_before_accept';
    case 'SEARCH_EXPIRED':
      return 'search_expired';
    case 'LATE_PAYMENT_AFTER_DEADLINE':
      return 'late_payment_after_deadline';
    case 'RIDER_CANCEL_AFTER_ACCEPT':
      return 'rider_cancel_after_accept';
    case 'RIDER_UNABLE_TO_COMPLETE':
      return 'rider_unable_to_complete';
    case 'CONNECTION_FEE_UNPAID_TIMEOUT':
      return 'connection_fee_unpaid_timeout';
    default:
      return `matrix:${situation}`;
  }
}

/**
 * Map a terminal booking onto the approved refund-matrix situation for sweeper recovery.
 * Returns null when the sweeper must not invent an automatic fee refund
 * (e.g. Support/Admin cancellation without a matrix path).
 */
export function situationForMissingFeeRefund(booking: {
  status: string;
  acceptedAt: Date | null;
  cancellationActorType: string | null;
  statusHistoryReasons?: Array<{ toStatus: string; reason: string | null }>;
}): RefundSituation | null {
  if (booking.status === 'COMPLETED') return 'COMPLETED';
  if (booking.status === 'PAYMENT_FAILED') return 'PAYMENT_FAILED';
  if (booking.status === 'EXPIRED') return 'SEARCH_EXPIRED';
  if (booking.status === 'CANCELLED') {
    const actor = booking.cancellationActorType;
    if (actor === 'RIDER') {
      const cancelHist = booking.statusHistoryReasons?.find((h) => h.toStatus === 'CANCELLED');
      if (cancelHist?.reason === 'rider_unable_to_complete') {
        return 'RIDER_UNABLE_TO_COMPLETE';
      }
      return 'RIDER_CANCEL_AFTER_ACCEPT';
    }
    if (actor === 'ADMIN') {
      // Support/Admin path — Finance/Support recommendation only; no sweeper auto-auth.
      return null;
    }
    // PASSENGER or unset actor on cancel.
    if (booking.acceptedAt) return 'PASSENGER_CANCEL_AFTER_ACCEPT';
    return 'PASSENGER_CANCEL_BEFORE_ACCEPT';
  }
  return null;
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
