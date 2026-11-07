import { Router, type RequestHandler } from 'express';
import { z } from 'zod';

import { Permission } from '../../common/authz/permissions.js';
import { authenticate, requireActiveAccount, requireRole } from '../../common/middleware/authenticate.js';
import { requirePermission, requireRecentMfa } from '../../common/middleware/authorize.js';
import { validate } from '../../common/middleware/validate.js';
import type { PaymentsController } from './module.controller.js';
import { initiateBookingFeeSchema } from './module.schema.js';

const refundIdParam = z.object({ refundId: z.string().uuid() }).strict();
const caseIdParam = z.object({ caseId: z.string().uuid() }).strict();
const resolveCaseBody = z.object({ notes: z.string().max(2000).optional() }).strict();

const passengerAuth: RequestHandler[] = [
  authenticate,
  requireActiveAccount,
  requireRole('PASSENGER', 'RIDER'),
];

export function createPaymentsRouter(controller: PaymentsController): Router {
  const router = Router();

  router.post(
    '/booking-fee',
    ...passengerAuth,
    validate({ body: initiateBookingFeeSchema }),
    controller.initiateBookingFee,
  );

  // Public: Paystack signature is the authorization.
  router.post('/paystack/webhook', controller.paystackWebhook);

  return router;
}

export function createPaymentsAdminRouter(controller: PaymentsController): Router {
  const router = Router();
  const financeView: RequestHandler[] = [
    authenticate,
    requireActiveAccount,
    requirePermission(Permission.ViewPayments),
  ];
  const financeReconcile: RequestHandler[] = [
    authenticate,
    requireActiveAccount,
    requirePermission(Permission.ReconcilePaystack),
    requireRecentMfa(),
  ];
  const execute: RequestHandler[] = [
    authenticate,
    requireActiveAccount,
    requirePermission(Permission.ExecuteRefunds),
    requireRecentMfa(),
  ];

  router.get('/refunds', ...financeView, controller.listRefunds);
  router.get(
    '/refunds/:refundId/reconciliation-attempts',
    ...financeView,
    validate({ params: refundIdParam }),
    controller.listRefundAttempts,
  );
  router.post(
    '/refunds/:refundId/execute',
    ...execute,
    validate({ params: refundIdParam }),
    controller.executeRefund,
  );
  router.post(
    '/refunds/:refundId/reconcile',
    ...financeReconcile,
    validate({ params: refundIdParam }),
    controller.reconcileRefund,
  );
  router.get('/reconciliation/cases', ...financeView, controller.listReconciliationCases);
  router.post(
    '/reconciliation/cases/:caseId/resolve',
    ...financeReconcile,
    validate({ params: caseIdParam, body: resolveCaseBody }),
    controller.resolveReconciliationCase,
  );
  return router;
}
