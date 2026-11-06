import { Router } from 'express';

import type { ModuleDeps } from '../../common/types/module-deps.js';
import { LocationsController } from './module.controller.js';
import { LocationsRepository } from './module.repository.js';
import { createLocationsRouter } from './module.routes.js';
import { LocationsServiceImpl, type LocationsService } from './module.service.js';

export interface LocationsModule {
  service: LocationsService;
  router: Router;
}

export function createLocationsModule(deps: ModuleDeps): LocationsModule {
  const repository = new LocationsRepository(deps.prisma);
  const service = new LocationsServiceImpl(repository);
  const controller = new LocationsController(service);
  return { service, router: createLocationsRouter(controller) };
}

export type { LocationsService };
