import 'dotenv/config';
import { createServer } from 'node:http';

import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { prisma } from './infrastructure/database/prisma.js';
import { setRealtimeServer } from './infrastructure/realtime/publisher.js';
import { createRealtimeServer } from './infrastructure/realtime/socket.js';

const app = createApp();
const httpServer = createServer(app);
const io = createRealtimeServer(httpServer, { prisma });
setRealtimeServer(io);

httpServer.listen(env.PORT, env.HOST, () => {
  logger.info({ host: env.HOST, port: env.PORT }, 'Cyrlo Ride API listening');
});

let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'shutting down');
  const force = setTimeout(() => {
    logger.error('forced shutdown after timeout');
    process.exit(1);
  }, 10_000);
  force.unref();

  await new Promise<void>((resolve, reject) => {
    httpServer.close((error) => (error ? reject(error) : resolve()));
  });
  await new Promise<void>((resolve) => {
    io.close(() => resolve());
  });
  await prisma.$disconnect();
  clearTimeout(force);
  process.exit(0);
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void shutdown(signal).catch((error: unknown) => {
      logger.error({ err: error }, 'shutdown failed');
      process.exit(1);
    });
  });
}
