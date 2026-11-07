import { Router } from 'express';

import type { ModuleDeps } from '../../common/types/module-deps.js';
import type { AuditService } from '../audit/module.service.js';
import { LocationsController } from './module.controller.js';
import { LocationsRepository } from './module.repository.js';
import { createLocationsAdminRouter, createLocationsRouter } from './module.routes.js';
import {
  LocationsServiceImpl,
  type LocationsService,
  type LocationsServiceDeps,
} from './module.service.js';

export interface LocationsModule {
  service: LocationsService;
  router: Router;
  adminRouter: Router;
}

export function createLocationsModule(
  deps: ModuleDeps & { audit: AuditService },
  options?: { serviceDeps?: Partial<LocationsServiceDeps> },
): LocationsModule {
  const repository = new LocationsRepository(deps.prisma);
  const service = new LocationsServiceImpl(repository, {
    audit: deps.audit,
    ...options?.serviceDeps,
  });
  const controller = new LocationsController(service);
  return {
    service,
    router: createLocationsRouter(controller),
    adminRouter: createLocationsAdminRouter(controller),
  };
}

export type { LocationsService };
