import { Router } from 'express';

import type { ModuleDeps } from '../../common/types/module-deps.js';
import type { AuditService } from '../audit/module.service.js';
import type { BookingsService } from '../bookings/module.service.js';
import { DisputesController } from './module.controller.js';
import { DisputesRepository } from './module.repository.js';
import { createDisputesAdminRouter, createDisputesRouter } from './module.routes.js';
import {
  DisputesServiceImpl,
  type DisputesService,
  type DisputesServiceDeps,
} from './module.service.js';

export interface DisputesModule {
  service: DisputesService;
  router: Router;
  adminRouter: Router;
}

export function createDisputesModule(
  deps: ModuleDeps & { audit: AuditService; bookings: BookingsService },
  options?: { serviceDeps?: Partial<DisputesServiceDeps> },
): DisputesModule {
  const repository = new DisputesRepository(deps.prisma);
  const service = new DisputesServiceImpl(repository, {
    audit: deps.audit,
    prisma: deps.prisma,
    bookings: deps.bookings,
    ...options?.serviceDeps,
  });
  const controller = new DisputesController(service);
  return {
    service,
    router: createDisputesRouter(controller),
    adminRouter: createDisputesAdminRouter(controller),
  };
}

export type { DisputesService };
