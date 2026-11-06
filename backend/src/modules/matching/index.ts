import { Router } from 'express';

import type { ModuleDeps } from '../../common/types/module-deps.js';
import { MatchingController } from './module.controller.js';
import { MatchingRepository } from './module.repository.js';
import { createMatchingRouter } from './module.routes.js';
import { MatchingServiceImpl, type MatchingService } from './module.service.js';

export interface MatchingModule {
  service: MatchingService;
  router: Router;
}

export function createMatchingModule(deps: ModuleDeps): MatchingModule {
  const repository = new MatchingRepository(deps.prisma);
  const service = new MatchingServiceImpl(repository);
  const controller = new MatchingController(service);
  return { service, router: createMatchingRouter(controller) };
}

export type { MatchingService };
