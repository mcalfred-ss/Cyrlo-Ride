import { Router } from 'express';

import { APP_VERSION } from '../../config/constants.js';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import {
  createPushProvider,
  describePushProvider,
} from '../../infrastructure/push/push.provider.js';
import {
  createSmsProvider,
  describeSmsProvider,
  smsOptionsFromEnv,
} from '../../infrastructure/sms/sms.provider.js';
import { AppError } from '../errors/app-error.js';

export function createHealthRouter(deps: { checkDatabase: () => Promise<void> }): Router {
  const router = Router();
  const sms = createSmsProvider(smsOptionsFromEnv(env));
  const push = createPushProvider({
    provider: env.PUSH_PROVIDER,
    apiKey: env.PUSH_API_KEY,
    projectId: env.FCM_PROJECT_ID,
    serviceAccountFile: env.FCM_SERVICE_ACCOUNT_FILE,
    nodeEnv: env.NODE_ENV,
  });

  router.get('/', (_req, res) => {
    res.json({
      success: true,
      data: {
        status: 'ok',
        service: 'cyrlo-ride-api',
        version: APP_VERSION,
        time: new Date().toISOString(),
      },
    });
  });

  router.get('/ready', async (_req, res, next) => {
    try {
      await deps.checkDatabase();
      const smsStatus = describeSmsProvider(sms);
      const pushStatus = describePushProvider(push);
      res.json({
        success: true,
        data: {
          status: 'ready',
          database: 'up',
          sms: {
            configured: smsStatus.configured,
            adapter: smsStatus.adapter,
            ready: smsStatus.ready,
          },
          push: {
            configured: pushStatus.configured,
            adapter: pushStatus.adapter,
            ready: pushStatus.ready,
            projectId: pushStatus.projectId ?? null,
            iosPath: pushStatus.iosPath ?? null,
          },
          trustProxy: env.trustProxySetting === false ? 'off' : env.trustProxySetting,
        },
      });
    } catch (error) {
      logger.warn({ err: error }, 'readiness check failed');
      next(
        new AppError({
          status: 503,
          code: 'SERVICE_UNAVAILABLE',
          message: 'Database is unavailable',
        }),
      );
    }
  });

  return router;
}
