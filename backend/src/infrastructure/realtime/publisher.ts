import type { Server } from 'socket.io';

import {
  RealtimeEvent,
  bookingRoom,
  userRoom,
  type BookingAcceptedPayload,
  type MatchingOfferCreatedPayload,
  type RiderAvailabilityUpdatedPayload,
  type RiderLocationUpdatedPayload,
} from './events.js';

/**
 * Optional Socket.IO publisher. Persistence never depends on this.
 * Exact rider coordinates are never broadcast to passengers before assignment.
 */
let io: Server | null = null;

export function setRealtimeServer(server: Server | null): void {
  io = server;
}

export function publishRiderAvailabilityUpdated(payload: RiderAvailabilityUpdatedPayload): void {
  if (!io) return;
  io.to(userRoom(payload.riderId)).emit(RealtimeEvent.RiderAvailabilityUpdated, payload);
}

export function publishRiderLocationUpdated(
  payload: RiderLocationUpdatedPayload,
  options?: { bookingId?: string },
): void {
  if (!io) return;
  io.to(userRoom(payload.riderId)).emit(RealtimeEvent.RiderLocationUpdated, {
    ...payload,
  });
  if (options?.bookingId) {
    io.to(bookingRoom(options.bookingId)).emit(RealtimeEvent.RiderLocationUpdated, payload);
  }
}

export function publishMatchingOfferCreated(payload: MatchingOfferCreatedPayload): void {
  if (!io) return;
  io.to(userRoom(payload.riderId)).emit(RealtimeEvent.MatchingOfferCreated, {
    offerId: payload.offerId,
    bookingId: payload.bookingId,
    expiresAt: payload.expiresAt,
    vehicleCategory: payload.vehicleCategory,
    pickup: payload.pickup,
    pickupLabel: payload.pickupLabel,
  });
}

export function publishBookingAccepted(payload: BookingAcceptedPayload): void {
  if (!io) return;
  io.to(userRoom(payload.passengerId)).emit(RealtimeEvent.BookingAccepted, {
    bookingId: payload.bookingId,
    riderId: payload.riderId,
    acceptedAt: payload.acceptedAt,
  });
  io.to(userRoom(payload.riderId)).emit(RealtimeEvent.BookingAccepted, {
    bookingId: payload.bookingId,
    riderId: payload.riderId,
    acceptedAt: payload.acceptedAt,
  });
  io.to(bookingRoom(payload.bookingId)).emit(RealtimeEvent.BookingAccepted, {
    bookingId: payload.bookingId,
    riderId: payload.riderId,
    acceptedAt: payload.acceptedAt,
  });
}

export function publishNotificationCreated(payload: {
  userId: string;
  notificationId: string;
  eventType: string;
  title: string;
  createdAt: string;
}): void {
  if (!io) return;
  io.to(userRoom(payload.userId)).emit('notification.created', {
    notificationId: payload.notificationId,
    eventType: payload.eventType,
    title: payload.title,
    createdAt: payload.createdAt,
  });
}
