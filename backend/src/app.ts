import cors from 'cors';
import express, { Router, type Express, type Request } from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import swaggerUi from 'swagger-ui-express';

import { API_PREFIX } from './config/constants.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { AppError } from './common/errors/app-error.js';
import { errorHandler } from './common/errors/error-handler.js';
import {
  apiRateLimiter,
  usesDedicatedRateLimiter,
} from './common/middleware/rate-limit.js';
import { requestId } from './common/middleware/request-id.js';
import { isAllowedCorsOrigin } from './common/http/cors-origin.js';
import { createHealthRouter } from './common/routes/health.routes.js';
import { openApiDocument } from './docs/openapi.js';
import { prisma } from './infrastructure/database/prisma.js';
import { startUnpaidBookingExpiryWorker } from './jobs/expire-unpaid-bookings.js';
import { startMatchingWorkers } from './jobs/matching-workers.js';
import { startNotificationOutboxWorker } from './jobs/notification-outbox-worker.js';
import { startRefundWorkers } from './jobs/refund-workers.js';
import { createPushProvider } from './infrastructure/push/push.provider.js';
import { createSmsProvider, smsOptionsFromEnv } from './infrastructure/sms/sms.provider.js';
import { createModules } from './composition.js';
import './common/types/express.js';

const allowedOrigins = new Set(env.CORS_ORIGINS);

export function createApp(): Express {
  const app = express();
  if (env.trustProxySetting !== false) {
    app.set('trust proxy', env.trustProxySetting);
  }
  app.disable('x-powered-by');

  app.use(requestId);
  // cross-origin so Flutter Web (and other browser clients) can read API JSON.
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );
  app.use(
    cors({
      origin(origin, callback) {
        if (isAllowedCorsOrigin(origin, allowedOrigins)) {
          callback(null, true);
          return;
        }
        callback(
          new AppError({
            status: 403,
            code: 'FORBIDDEN',
            message: 'Origin is not allowed',
          }),
        );
      },
      credentials: true,
    }),
  );
  app.use(
    express.json({
      limit: '1mb',
      verify: (req, _res, buf) => {
        (req as Request).rawBody = Buffer.from(buf);
      },
    }),
  );
  app.use(
    pinoHttp({
      logger,
      customProps: (req) => ({ requestId: (req as Request).requestId }),
    }),
  );

  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(openApiDocument));

  const modules = createModules({ prisma });
  const api = Router();
  api.use((req, res, next) => {
    if (req.path === '/health' || req.path.startsWith('/health/')) {
      next();
      return;
    }
    // Webhook + rider GPS POST use dedicated limiters mounted on those routes.
    if (usesDedicatedRateLimiter(req.path, req.method)) {
      next();
      return;
    }
    apiRateLimiter(req, res, next);
  });
  api.use(
    '/health',
    createHealthRouter({
      checkDatabase: async () => {
        await prisma.$queryRaw`SELECT 1`;
      },
    }),
  );
  api.use('/auth', modules.auth.router);
  api.use('/users', modules.users.router);
  api.use('/riders', modules.riders.router);
  api.use('/bookings', modules.bookings.router);
  api.use('/bookings', modules.disputes.router);
  api.use('/matching', modules.matching.router);
  api.use('/admin', modules.disputes.adminRouter);
  api.use('/locations', modules.locations.router);
  api.use('/maps', modules.maps.router);
  api.use('/payments', modules.payments.router);
  api.use('/admin/payments', modules.payments.adminRouter);
  api.use('/wallet', modules.wallet.router);
  api.use('/admin', modules.wallet.adminRouter);
  api.use('/notifications', modules.notifications.router);
  api.use('/admin', modules.admin.router);
  api.use('/admin/riders', modules.riders.opsRouter);
  api.use('/admin/riders', modules.serviceZones.riderZoneAdminRouter);
  api.use('/admin/riders', modules.locations.adminRouter);
  api.use('/admin/geo', modules.geo.router);
  api.use('/service-zones', modules.serviceZones.router);
  api.use('/admin/service-zones', modules.serviceZones.router);
  api.use('/audit', modules.audit.router);
  app.use(API_PREFIX, api);

  if (env.NODE_ENV !== 'test') {
    startUnpaidBookingExpiryWorker(modules.bookings.service);
    startMatchingWorkers(modules.matching.service);
    startRefundWorkers(modules.payments.service);
    startNotificationOutboxWorker({
      prisma,
      push: createPushProvider({
        provider: env.PUSH_PROVIDER,
        apiKey: env.PUSH_API_KEY,
        projectId: env.FCM_PROJECT_ID,
        serviceAccountFile: env.FCM_SERVICE_ACCOUNT_FILE,
        nodeEnv: env.NODE_ENV,
      }),
      sms: createSmsProvider(smsOptionsFromEnv(env)),
    });
  }

  app.use((req, res) => {
    res.status(404).json({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: 'Resource not found',
        ...(req.requestId ? { requestId: req.requestId } : {}),
      },
    });
  });
  app.use(errorHandler);
  return app;
}
