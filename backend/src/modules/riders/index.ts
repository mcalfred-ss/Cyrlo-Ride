import { Router } from 'express';

import type { ModuleDeps } from '../../common/types/module-deps.js';
import { RidersController } from './module.controller.js';
import { RidersRepository } from './module.repository.js';
import { createRidersRouter } from './module.routes.js';
import { RidersServiceImpl, type RidersService } from './module.service.js';

export interface RidersModule {
  service: RidersService;
  router: Router;
}

export function createRidersModule(deps: ModuleDeps): RidersModule {
  const repository = new RidersRepository(deps.prisma);
  const service = new RidersServiceImpl(repository);
  const controller = new RidersController(service);
  return { service, router: createRidersRouter(controller) };
}

export type { RidersService };
