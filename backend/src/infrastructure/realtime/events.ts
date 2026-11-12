import type { Coordinates } from '../../common/schemas/coordinates.js';

export const RealtimeEvent = {
  BookingRequested: 'booking.requested',
  BookingAccepted: 'booking.accepted',
  BookingStarted: 'booking.started',
  BookingRejected: 'booking.rejected',
  BookingCancelled: 'booking.cancelled',
  BookingCompleted: 'booking.completed',
  MatchingOfferCreated: 'matching.offer.created',
  RiderLocationUpdated: 'rider.location.updated',
  RiderAvailabilityUpdated: 'rider.availability.updated',
} as const;

export type RealtimeEventName = (typeof RealtimeEvent)[keyof typeof RealtimeEvent];

export interface BookingRequestedPayload {
  bookingId: string;
  passengerId: string;
  pickup: Coordinates;
  destination?: Coordinates | null;
  bookingFeePesewas: number;
  requestedAt: string;
}

export interface BookingAcceptedPayload {
  bookingId: string;
  riderId: string;
  passengerId: string;
  acceptedAt: string;
}

/** Delivered to the offered rider's user room (not broadcast). */
export interface MatchingOfferCreatedPayload {
  riderId: string;
  offerId: string;
  bookingId: string;
  expiresAt: string;
  vehicleCategory: string;
  pickup: Coordinates;
  pickupLabel?: string;
}

export interface BookingStartedPayload {
  bookingId: string;
  riderId: string;
  startedAt: string;
}

export interface BookingRejectedPayload {
  bookingId: string;
  riderId: string;
  rejectedAt: string;
  bookingStatus: 'REQUESTED' | 'EXPIRED';
}

export interface BookingCancelledPayload {
  bookingId: string;
  cancelledBy: 'PASSENGER' | 'RIDER' | 'ADMIN' | 'SYSTEM';
  cancelledAt: string;
  reason?: string;
}

export interface BookingCompletedPayload {
  bookingId: string;
  riderId: string;
  completedAt: string;
}

export interface RiderLocationUpdatedPayload {
  riderId: string;
  bookingId?: string;
  latitude: number;
  longitude: number;
  heading?: number;
  accuracyMeters?: number;
  recordedAt: string;
}

export interface RiderAvailabilityUpdatedPayload {
  riderId: string;
  availability: 'OFFLINE' | 'AVAILABLE' | 'BUSY';
  updatedAt: string;
}

export function userRoom(userId: string): string {
  return `user:${userId}`;
}

export function bookingRoom(bookingId: string): string {
  return `booking:${bookingId}`;
}
