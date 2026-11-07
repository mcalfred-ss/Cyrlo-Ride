import type { Server as HttpServer } from 'node:http';

import { Server } from 'socket.io';
import type { PrismaClient } from '@prisma/client';

import { env } from '../../config/env.js';
import { verifyAccessToken } from '../../common/security/tokens.js';
import { bookingRoom, userRoom } from './events.js';

export interface RealtimeServerDeps {
  prisma?: PrismaClient;
}

/**
 * Socket.IO shares the HTTP server. Connections require an access token.
 * Clients may only join their user room automatically, and booking rooms after
 * server-side ownership checks (passenger or assigned rider).
 */
export function createRealtimeServer(
  httpServer: HttpServer,
  deps: RealtimeServerDeps = {},
): Server {
  const io = new Server(httpServer, {
    cors: {
      origin: env.CORS_ORIGINS,
      credentials: true,
    },
  });

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (typeof token !== 'string' || token.length === 0) {
      next(new Error('UNAUTHORIZED'));
      return;
    }
    try {
      const claims = verifyAccessToken(token, env.JWT_ACCESS_SECRET, {
        issuer: env.JWT_ISSUER,
        audience: env.JWT_AUDIENCE,
      });
      socket.data.userId = claims.sub;
      socket.data.role = claims.role;
      next();
    } catch {
      next(new Error('UNAUTHORIZED'));
    }
  });

  io.on('connection', (socket) => {
    const userId = socket.data.userId;
    if (typeof userId === 'string' && userId.length > 0) {
      void socket.join(userRoom(userId));
    }

    socket.on('booking:subscribe', (bookingId: unknown, ack?: (result: unknown) => void) => {
      void (async () => {
        try {
          if (typeof bookingId !== 'string' || !/^[0-9a-f-]{36}$/i.test(bookingId)) {
            ack?.({ ok: false, code: 'VALIDATION_ERROR' });
            return;
          }
          if (!deps.prisma || typeof userId !== 'string') {
            ack?.({ ok: false, code: 'SERVICE_UNAVAILABLE' });
            return;
          }
          const booking = await deps.prisma.booking.findUnique({
            where: { id: bookingId },
            select: { passengerId: true, riderId: true },
          });
          if (!booking || (booking.passengerId !== userId && booking.riderId !== userId)) {
            ack?.({ ok: false, code: 'FORBIDDEN' });
            return;
          }
          await socket.join(bookingRoom(bookingId));
          ack?.({ ok: true, room: bookingRoom(bookingId) });
        } catch {
          ack?.({ ok: false, code: 'INTERNAL_ERROR' });
        }
      })();
    });

    socket.on('booking:unsubscribe', (bookingId: unknown, ack?: (result: unknown) => void) => {
      if (typeof bookingId !== 'string') {
        ack?.({ ok: false, code: 'VALIDATION_ERROR' });
        return;
      }
      void socket.leave(bookingRoom(bookingId));
      ack?.({ ok: true });
    });
  });

  return io;
}
