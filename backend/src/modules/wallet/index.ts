import { Router } from 'express';

import type { ModuleDeps } from '../../common/types/module-deps.js';
import type { AuditService } from '../audit/module.service.js';
import type { PaystackClient } from '../../infrastructure/payments/paystack-client.js';
import { WalletController } from './module.controller.js';
import { WalletRepository } from './module.repository.js';
import { createWalletAdminRouter, createWalletRouter } from './module.routes.js';
import {
  WalletServiceImpl,
  type WalletService,
  type WalletServiceDeps,
} from './module.service.js';

export interface WalletModule {
  service: WalletService;
  router: Router;
  adminRouter: Router;
}

export function createWalletModule(
  deps: ModuleDeps & { audit: AuditService },
  options?: { paystack?: PaystackClient; serviceDeps?: Partial<WalletServiceDeps> },
): WalletModule {
  const repository = new WalletRepository(deps.prisma);
  const service = new WalletServiceImpl(repository, {
    audit: deps.audit,
    prisma: deps.prisma,
    paystack: options?.paystack,
    ...options?.serviceDeps,
  });
  const controller = new WalletController(service);
  return {
    service,
    router: createWalletRouter(controller),
    adminRouter: createWalletAdminRouter(controller),
  };
}

export type { WalletService };
