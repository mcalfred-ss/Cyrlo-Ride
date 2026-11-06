import type { Server as HttpServer } from 'node:http';

import { Server } from 'socket.io';

import { env } from '../../config/env.js';
import { verifyAccessToken } from '../../common/security/tokens.js';
import { userRoom } from './events.js';

/**
 * Socket.IO shares the HTTP server. Connections require an access token.
 * Booking and location events are documented in events.ts and are not emitted yet.
 */
export function createRealtimeServer(httpServer: HttpServer): Server {
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
      const claims = verifyAccessToken(token, env.JWT_ACCESS_SECRET);
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
  });

  return io;
}
