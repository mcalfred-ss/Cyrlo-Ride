import { Router, type RequestHandler } from 'express';
import { z } from 'zod';

import { Permission } from '../../common/authz/permissions.js';
import { AppError } from '../../common/errors/app-error.js';
import { authenticate, requireActiveAccount } from '../../common/middleware/authenticate.js';
import {
  requirePermission,
  requireRecentMfa,
} from '../../common/middleware/authorize.js';
import { documentUpload } from '../../common/middleware/upload.js';
import { validate } from '../../common/middleware/validate.js';
import type { RidersController } from './module.controller.js';
import {
  createVehicleSchema,
  documentKindSchema,
  reviewRiderSchema,
  reviewVehicleSchema,
  startRiderOnboardingSchema,
  updateAvailabilitySchema,
  updateRiderOnboardingSchema,
  updateVehicleSchema,
} from './module.schema.js';

const uuidParam = z.object({ vehicleId: z.string().uuid() }).strict();
const riderIdParam = z.object({ riderId: z.string().uuid() }).strict();
const documentIdParam = z.object({ documentId: z.string().uuid() }).strict();

const requirePassengerOrRider: RequestHandler = (req, _res, next) => {
  if (!req.auth || (req.auth.role !== 'PASSENGER' && req.auth.role !== 'RIDER')) {
    next(
      new AppError({
        status: 403,
        code: 'FORBIDDEN',
        message: 'Only passenger or rider accounts can access rider onboarding',
      }),
    );
    return;
  }
  next();
};

export function createRidersRouter(controller: RidersController): Router {
  const router = Router();
  const riderAuth: RequestHandler[] = [
    authenticate,
    requireActiveAccount,
    requirePassengerOrRider,
  ];
  const riderOnly: RequestHandler[] = [
    authenticate,
    requireActiveAccount,
    (req, _res, next) => {
      if (!req.auth || req.auth.role !== 'RIDER') {
        next(
          new AppError({
            status: 403,
            code: 'FORBIDDEN',
            message: 'Only rider accounts can change availability',
          }),
        );
        return;
      }
      next();
    },
  ];

  router.post(
    '/availability',
    ...riderOnly,
    validate({ body: updateAvailabilitySchema }),
    controller.setAvailability,
  );
  router.get('/eligibility', ...riderOnly, controller.getOperationalEligibility);

  router.post(
    '/onboarding',
    ...riderAuth,
    validate({ body: startRiderOnboardingSchema }),
    controller.startOnboarding,
  );
  router.patch(
    '/onboarding',
    ...riderAuth,
    validate({ body: updateRiderOnboardingSchema }),
    controller.updateOnboarding,
  );
  router.get('/onboarding', ...riderAuth, controller.getMyApplication);
  router.post('/onboarding/submit', ...riderAuth, controller.submitApplication);

  router.post(
    '/vehicles',
    ...riderAuth,
    validate({ body: createVehicleSchema }),
    controller.createVehicle,
  );
  router.patch(
    '/vehicles/:vehicleId',
    ...riderAuth,
    validate({ params: uuidParam, body: updateVehicleSchema }),
    controller.updateVehicle,
  );

  router.post(
    '/documents',
    ...riderAuth,
    documentUpload.single('file'),
    (req, _res, next) => {
      const parsed = documentKindSchema.safeParse(req.body?.kind);
      if (!parsed.success) {
        next(
          new AppError({
            status: 400,
            code: 'VALIDATION_ERROR',
            message: 'Document kind is required',
          }),
        );
        return;
      }
      next();
    },
    controller.uploadDocument,
  );

  return router;
}

export function createRiderOpsRouter(controller: RidersController): Router {
  const router = Router();
  const ops: RequestHandler[] = [
    authenticate,
    requireActiveAccount,
    requirePermission(Permission.ReviewRiders),
  ];
  const identity: RequestHandler[] = [
    authenticate,
    requireActiveAccount,
    requirePermission(Permission.AccessIdentityDocuments),
    requireRecentMfa(),
  ];

  router.get('/applications', ...ops, controller.listPending);
  router.get(
    '/applications/:riderId',
    ...ops,
    validate({ params: riderIdParam }),
    controller.getApplication,
  );
  router.post(
    '/applications/:riderId/review',
    ...ops,
    validate({ params: riderIdParam, body: reviewRiderSchema }),
    controller.reviewApplication,
  );
  router.post(
    '/vehicles/:vehicleId/review',
    ...ops,
    validate({ params: uuidParam, body: reviewVehicleSchema }),
    controller.reviewVehicle,
  );
  router.get(
    '/documents/:documentId/content',
    ...identity,
    validate({ params: documentIdParam }),
    controller.openDocument,
  );
  router.get(
    '/applications/:riderId/ghana-card',
    ...identity,
    validate({ params: riderIdParam }),
    controller.revealGhanaCard,
  );

  return router;
}
