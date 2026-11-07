import { Router, type RequestHandler } from 'express';
import { z } from 'zod';

import { Permission } from '../../common/authz/permissions.js';
import { authenticate, requireActiveAccount, requireRole } from '../../common/middleware/authenticate.js';
import { requirePermission, requireRecentMfa } from '../../common/middleware/authorize.js';
import { validate } from '../../common/middleware/validate.js';
import type { WalletController } from './module.controller.js';
import {
  createPackageSchema,
  listPageQuerySchema,
  packageIdParamSchema,
  purchaseIdParamSchema,
  purchasePackageSchema,
  updatePackageSchema,
} from './module.schema.js';

const riderAuth: RequestHandler[] = [authenticate, requireActiveAccount, requireRole('RIDER')];

export function createWalletRouter(controller: WalletController): Router {
  const router = Router();
  router.get('/packages', ...riderAuth, controller.listPackages);
  router.get('/balance', ...riderAuth, controller.balance);
  router.get('/ledger', ...riderAuth, validate({ query: listPageQuerySchema }), controller.ledger);
  router.get(
    '/purchases',
    ...riderAuth,
    validate({ query: listPageQuerySchema }),
    controller.listPurchases,
  );
  router.get(
    '/purchases/:purchaseId',
    ...riderAuth,
    validate({ params: purchaseIdParamSchema }),
    controller.getPurchase,
  );
  router.post(
    '/purchases',
    ...riderAuth,
    validate({ body: purchasePackageSchema }),
    controller.purchase,
  );
  return router;
}

export function createWalletAdminRouter(controller: WalletController): Router {
  const router = Router();
  const viewPackages: RequestHandler[] = [
    authenticate,
    requireActiveAccount,
    requirePermission(Permission.ManageTokenPackages),
  ];
  const mutatePackages: RequestHandler[] = [
    authenticate,
    requireActiveAccount,
    requirePermission(Permission.ManageTokenPackages),
    requireRecentMfa(),
  ];
  const viewPurchases: RequestHandler[] = [
    authenticate,
    requireActiveAccount,
    requirePermission(Permission.ViewPayments),
  ];

  router.get('/token-packages', ...viewPackages, controller.adminListPackages);
  router.post(
    '/token-packages',
    ...mutatePackages,
    validate({ body: createPackageSchema }),
    controller.adminCreatePackage,
  );
  router.patch(
    '/token-packages/:packageId',
    ...mutatePackages,
    validate({ params: packageIdParamSchema, body: updatePackageSchema }),
    controller.adminUpdatePackage,
  );
  router.get(
    '/token-purchases',
    ...viewPurchases,
    validate({
      query: listPageQuerySchema.extend({
        status: z.enum(['PENDING', 'PAID', 'FAILED', 'ABANDONED']).optional(),
      }),
    }),
    controller.adminListPurchases,
  );
  return router;
}
