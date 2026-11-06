import { Router } from 'express';

import type { ModuleDeps } from '../../common/types/module-deps.js';
import { WalletController } from './module.controller.js';
import { WalletRepository } from './module.repository.js';
import { createWalletRouter } from './module.routes.js';
import { WalletServiceImpl, type WalletService } from './module.service.js';

export interface WalletModule {
  service: WalletService;
  router: Router;
}

export function createWalletModule(deps: ModuleDeps): WalletModule {
  const repository = new WalletRepository(deps.prisma);
  const service = new WalletServiceImpl(repository);
  const controller = new WalletController(service);
  return { service, router: createWalletRouter(controller) };
}

export type { WalletService };
