import { Router } from 'express';

import type { ModuleDeps } from '../../common/types/module-deps.js';
import { ServiceZonesController } from './module.controller.js';
import { ServiceZonesRepository } from './module.repository.js';
import { createServiceZonesRouter } from './module.routes.js';
import { ServiceZonesServiceImpl, type ServiceZonesService } from './module.service.js';

export interface ServiceZonesModule {
  service: ServiceZonesService;
  router: Router;
}

export function createServiceZonesModule(deps: ModuleDeps): ServiceZonesModule {
  const repository = new ServiceZonesRepository(deps.prisma);
  const service = new ServiceZonesServiceImpl(repository);
  const controller = new ServiceZonesController(service);
  return { service, router: createServiceZonesRouter(controller) };
}

export type { ServiceZonesService };
