import { Router } from 'express';

import type { ModuleDeps } from '../../common/types/module-deps.js';
import type { AuditService } from '../audit/module.service.js';
import { ServiceZonesController } from './module.controller.js';
import { ServiceZonesRepository } from './module.repository.js';
import {
  createRiderZoneAdminRouter,
  createServiceZonesRouter,
} from './module.routes.js';
import {
  ServiceZonesServiceImpl,
  type ServiceZonesService,
  type ServiceZonesServiceDeps,
} from './module.service.js';

export interface ServiceZonesModule {
  service: ServiceZonesService;
  router: Router;
  riderZoneAdminRouter: Router;
}

export function createServiceZonesModule(
  deps: ModuleDeps & { audit: AuditService },
  options?: { serviceDeps?: Partial<ServiceZonesServiceDeps> },
): ServiceZonesModule {
  const repository = new ServiceZonesRepository(deps.prisma);
  const service = new ServiceZonesServiceImpl(repository, {
    audit: deps.audit,
    ...options?.serviceDeps,
  });
  const controller = new ServiceZonesController(service);
  return {
    service,
    router: createServiceZonesRouter(controller),
    riderZoneAdminRouter: createRiderZoneAdminRouter(controller),
  };
}

export type { ServiceZonesService };
