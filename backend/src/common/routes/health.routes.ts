import { Router } from 'express';

import { APP_VERSION } from '../../config/constants.js';
import { logger } from '../../config/logger.js';
import { AppError } from '../errors/app-error.js';

export function createHealthRouter(deps: { checkDatabase: () => Promise<void> }): Router {
  const router = Router();

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
      res.json({ success: true, data: { status: 'ready', database: 'up' } });
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
