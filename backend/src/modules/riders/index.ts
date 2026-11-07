import { Router } from 'express';

import type { ModuleDeps } from '../../common/types/module-deps.js';
import { createObjectStorage, type ObjectStorage } from '../../infrastructure/storage/object-storage.js';
import type { AuditService } from '../audit/module.service.js';
import { RidersController } from './module.controller.js';
import { RidersRepository } from './module.repository.js';
import { createRiderOpsRouter, createRidersRouter } from './module.routes.js';
import { RidersServiceImpl, type RidersService, type RidersServiceDeps } from './module.service.js';

export interface RidersModule {
  service: RidersService;
  router: Router;
  opsRouter: Router;
}

export function createRidersModule(
  deps: ModuleDeps & { audit: AuditService },
  options?: { storage?: ObjectStorage; serviceDeps?: Partial<RidersServiceDeps> },
): RidersModule {
  const repository = new RidersRepository(deps.prisma);
  const storage = options?.storage ?? createObjectStorage();
  const service = new RidersServiceImpl(repository, {
    storage,
    audit: deps.audit,
    ...options?.serviceDeps,
  });
  const controller = new RidersController(service);
  return {
    service,
    router: createRidersRouter(controller),
    opsRouter: createRiderOpsRouter(controller),
  };
}

export type { RidersService };
