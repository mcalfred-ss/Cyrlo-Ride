import { Router, type RequestHandler } from 'express';

import { Permission } from '../../common/authz/permissions.js';
import { authenticate, requireActiveAccount } from '../../common/middleware/authenticate.js';
import {
  requireAnyPermission,
  requirePermission,
  requireRecentMfa,
} from '../../common/middleware/authorize.js';
import { validate } from '../../common/middleware/validate.js';
import type { DisputesController } from './module.controller.js';
import {
  bookingIdParamSchema,
  cancellationRequestIdParamSchema,
  createDisputeSchema,
  disputeIdParamSchema,
  listDisputesQuerySchema,
  supportRecommendationSchema,
} from './module.schema.js';
import { z } from 'zod';

const userAuth: RequestHandler[] = [authenticate, requireActiveAccount];

export function createDisputesRouter(controller: DisputesController): Router {
  const router = Router({ mergeParams: true });
  router.post(
    '/:bookingId/disputes',
    ...userAuth,
    validate({ params: bookingIdParamSchema, body: createDisputeSchema }),
    controller.submit,
  );
  return router;
}

export function createDisputesAdminRouter(controller: DisputesController): Router {
  const router = Router();
  router.get(
    '/disputes',
    authenticate,
    requireActiveAccount,
    requirePermission(Permission.InvestigateDisputes),
    validate({ query: listDisputesQuerySchema }),
    controller.list,
  );
  router.get(
    '/disputes/:disputeId',
    authenticate,
    requireActiveAccount,
    requirePermission(Permission.InvestigateDisputes),
    validate({ params: disputeIdParamSchema }),
    controller.get,
  );
  router.get(
    '/bookings/:bookingId/trip-gps',
    authenticate,
    requireActiveAccount,
    requirePermission(Permission.ViewTripGpsEvidence),
    requireRecentMfa(),
    validate({ params: bookingIdParamSchema }),
    controller.tripGps,
  );
  router.post(
    '/disputes/:disputeId/recommend',
    authenticate,
    requireActiveAccount,
    requirePermission(Permission.RecommendRefunds),
    requireRecentMfa(),
    validate({ params: disputeIdParamSchema, body: supportRecommendationSchema }),
    controller.recommendDispute,
  );
  router.get(
    '/cancellation-requests',
    authenticate,
    requireActiveAccount,
    requireAnyPermission(Permission.InvestigateDisputes, Permission.RecordSupportDecisions),
    validate({
      query: z
        .object({
          page: z.coerce.number().int().positive().default(1),
          pageSize: z.coerce.number().int().positive().max(100).default(20),
        })
        .strict(),
    }),
    controller.listCancellationRequests,
  );
  router.post(
    '/cancellation-requests/:requestId/recommend',
    authenticate,
    requireActiveAccount,
    requirePermission(Permission.RecordSupportDecisions),
    requireRecentMfa(),
    validate({
      params: cancellationRequestIdParamSchema,
      body: supportRecommendationSchema,
    }),
    controller.recommendCancellation,
  );
  return router;
}
