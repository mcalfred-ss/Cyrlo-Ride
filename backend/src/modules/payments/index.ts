import { Router } from 'express';

import type { ModuleDeps } from '../../common/types/module-deps.js';
import type { AuditService } from '../audit/module.service.js';
import type { BookingsService } from '../bookings/module.service.js';
import type { MatchingService } from '../matching/module.service.js';
import type { WalletService } from '../wallet/module.service.js';
import type { PaystackClient } from '../../infrastructure/payments/paystack-client.js';
import { PaymentsController } from './module.controller.js';
import { PaymentsRepository } from './module.repository.js';
import { createPaymentsAdminRouter, createPaymentsRouter } from './module.routes.js';
import {
  PaymentsServiceImpl,
  type PaymentsService,
  type PaymentsServiceDeps,
} from './module.service.js';

export interface PaymentsModule {
  service: PaymentsService;
  router: Router;
  adminRouter: Router;
}

export function createPaymentsModule(
  deps: ModuleDeps & {
    audit: AuditService;
    bookings: BookingsService;
    matching?: MatchingService;
    wallet?: WalletService;
  },
  options?: { paystack?: PaystackClient; serviceDeps?: Partial<PaymentsServiceDeps> },
): PaymentsModule {
  const repository = new PaymentsRepository(deps.prisma);
  const service = new PaymentsServiceImpl(repository, {
    audit: deps.audit,
    prisma: deps.prisma,
    bookings: deps.bookings,
    matching: deps.matching,
    wallet: deps.wallet,
    paystack: options?.paystack,
    ...options?.serviceDeps,
  });
  const controller = new PaymentsController(service);
  return {
    service,
    router: createPaymentsRouter(controller),
    adminRouter: createPaymentsAdminRouter(controller),
  };
}

export type { PaymentsService };
