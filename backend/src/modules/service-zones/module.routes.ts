import { Router, type RequestHandler } from 'express';
import { z } from 'zod';

import { Permission } from '../../common/authz/permissions.js';
import { authenticate, requireActiveAccount } from '../../common/middleware/authenticate.js';
import { requirePermission } from '../../common/middleware/authorize.js';
import { validate } from '../../common/middleware/validate.js';
import type { ServiceZonesController } from './module.controller.js';
import {
  assignRiderZoneSchema,
  createServiceZoneSchema,
  listServiceZonesQuerySchema,
  rejectOrRevokeZoneSchema,
  updateServiceZoneSchema,
} from './module.schema.js';

const zoneIdParam = z.object({ zoneId: z.string().uuid() }).strict();
const approvalIdParam = z.object({ approvalId: z.string().uuid() }).strict();
const riderIdParam = z.object({ riderId: z.string().uuid() }).strict();

const manage: RequestHandler[] = [
  authenticate,
  requireActiveAccount,
  requirePermission(Permission.ManageServiceZones),
];

export function createServiceZonesRouter(controller: ServiceZonesController): Router {
  const router = Router();

  router.post('/', ...manage, validate({ body: createServiceZoneSchema }), controller.create);
  router.get('/', ...manage, validate({ query: listServiceZonesQuerySchema }), controller.list);

  // Static path segments before /:zoneId
  router.post(
    '/rider-approvals/:approvalId/approve',
    ...manage,
    validate({ params: approvalIdParam }),
    controller.approve,
  );
  router.post(
    '/rider-approvals/:approvalId/reject',
    ...manage,
    validate({ params: approvalIdParam, body: rejectOrRevokeZoneSchema }),
    controller.reject,
  );
  router.post(
    '/rider-approvals/:approvalId/revoke',
    ...manage,
    validate({ params: approvalIdParam, body: rejectOrRevokeZoneSchema }),
    controller.revoke,
  );

  router.get('/:zoneId', ...manage, validate({ params: zoneIdParam }), controller.get);
  router.patch(
    '/:zoneId',
    ...manage,
    validate({ params: zoneIdParam, body: updateServiceZoneSchema }),
    controller.update,
  );
  router.post(
    '/:zoneId/activate',
    ...manage,
    validate({ params: zoneIdParam }),
    controller.activate,
  );
  router.post(
    '/:zoneId/deactivate',
    ...manage,
    validate({ params: zoneIdParam }),
    controller.deactivate,
  );
  router.post(
    '/:zoneId/rider-approvals',
    ...manage,
    validate({ params: zoneIdParam, body: assignRiderZoneSchema }),
    controller.assignRider,
  );
  router.get(
    '/:zoneId/rider-approvals',
    ...manage,
    validate({ params: zoneIdParam }),
    controller.listZoneRiders,
  );

  return router;
}

/** Mounted under `/admin/riders` for rider-centric zone views. */
export function createRiderZoneAdminRouter(controller: ServiceZonesController): Router {
  const router = Router();
  router.get(
    '/:riderId/zone-approvals/history',
    ...manage,
    validate({ params: riderIdParam }),
    controller.listRiderZoneHistory,
  );
  router.get(
    '/:riderId/zone-approvals',
    ...manage,
    validate({ params: riderIdParam }),
    controller.listRiderZones,
  );
  return router;
}
