import { Router, type RequestHandler } from 'express';
import { z } from 'zod';

import { Permission } from '../../common/authz/permissions.js';
import { authenticate, requireActiveAccount, requireRole } from '../../common/middleware/authenticate.js';
import { requireAnyPermission } from '../../common/middleware/authorize.js';
import { riderGpsRateLimiter } from '../../common/middleware/rate-limit.js';
import { validate } from '../../common/middleware/validate.js';
import type { LocationsController } from './module.controller.js';
import { updateLocationSchema } from './module.schema.js';

const riderIdParam = z.object({ riderId: z.string().uuid() }).strict();

const riderAuth: RequestHandler[] = [
  authenticate,
  requireActiveAccount,
  requireRole('RIDER'),
];

const staffLocationAuth: RequestHandler[] = [
  authenticate,
  requireActiveAccount,
  requireAnyPermission(Permission.MonitorOperations, Permission.ViewTripGpsEvidence),
];

export function createLocationsRouter(controller: LocationsController): Router {
  const router = Router();

  router.post(
    '/rider',
    ...riderAuth,
    // After auth: per-user GPS bucket, isolated from general API limits.
    riderGpsRateLimiter,
    validate({ body: updateLocationSchema }),
    controller.updateOwn,
  );
  router.post('/rider/stop', ...riderAuth, controller.stopSharing);
  router.get('/rider/me', ...riderAuth, controller.getOwn);
  router.get('/rider/eligibility', ...riderAuth, controller.getEligibility);

  return router;
}

/** Mounted under `/admin/riders` for privileged location reads. */
export function createLocationsAdminRouter(controller: LocationsController): Router {
  const router = Router();
  router.get(
    '/:riderId/location',
    ...staffLocationAuth,
    validate({ params: riderIdParam }),
    controller.getStaffLocation,
  );
  return router;
}
