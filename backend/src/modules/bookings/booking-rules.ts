import { TOKEN_COST_PER_ACCEPTANCE } from '../../config/constants.js';
import { AppError } from '../../common/errors/app-error.js';

export const BookingStatus = {
  Requested: 'REQUESTED',
  Accepted: 'ACCEPTED',
  Cancelled: 'CANCELLED',
  Completed: 'COMPLETED',
  Expired: 'EXPIRED',
} as const;

export type BookingStatus = (typeof BookingStatus)[keyof typeof BookingStatus];

export const BookingOfferStatus = {
  Pending: 'PENDING',
  Accepted: 'ACCEPTED',
  Rejected: 'REJECTED',
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

const bookingTransitions: Record<BookingStatus, Partial<Record<BookingStatus, readonly BookingActor[]>>> = {
  REQUESTED: {
    ACCEPTED: ['RIDER'],
    CANCELLED: ['PASSENGER', 'ADMIN', 'SYSTEM'],
    EXPIRED: ['SYSTEM'],
  },
  ACCEPTED: {
    CANCELLED: ['PASSENGER', 'RIDER', 'ADMIN', 'SYSTEM'],
    COMPLETED: ['RIDER'],
  },
  CANCELLED: {},
  COMPLETED: {},
  EXPIRED: {},
};

const offerTransitions: Record<
  BookingOfferStatus,
  Partial<Record<BookingOfferStatus, readonly BookingActor[]>>
> = {
  PENDING: {
    ACCEPTED: ['RIDER'],
    REJECTED: ['RIDER'],
    EXPIRED: ['SYSTEM'],
    CANCELLED: ['PASSENGER', 'ADMIN', 'SYSTEM'],
  },
  ACCEPTED: {},
  REJECTED: {},
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

export function shouldRefundBookingFee(input: {
  feeCaptured: boolean;
  nextStatus: BookingStatus;
  riderAccepted: boolean;
}): boolean {
  if (!input.feeCaptured || input.riderAccepted) return false;
  return input.nextStatus === 'CANCELLED' || input.nextStatus === 'EXPIRED';
}

export function shouldRefundToken(input: {
  tokenDebited: boolean;
  nextStatus: BookingStatus;
  cancelledBy?: BookingActor;
}): boolean {
  if (!input.tokenDebited || input.nextStatus !== 'CANCELLED') return false;
  return input.cancelledBy !== 'RIDER';
}
