import type { Server } from 'socket.io';

import {
  RealtimeEvent,
  bookingRoom,
  userRoom,
  type RiderAvailabilityUpdatedPayload,
  type RiderLocationUpdatedPayload,
} from './events.js';

/**
 * Optional Socket.IO publisher. Persistence never depends on this.
 * Coordinates are emitted only to the rider's user room or an assigned booking room.
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
