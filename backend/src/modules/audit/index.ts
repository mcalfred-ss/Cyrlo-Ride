import { Router } from 'express';

import type { ModuleDeps } from '../../common/types/module-deps.js';
import { AuditController } from './module.controller.js';
import { AuditRepository } from './module.repository.js';
import { createAuditRouter } from './module.routes.js';
import { AuditServiceImpl, type AuditService } from './module.service.js';

export interface AuditModule {
  service: AuditService;
  router: Router;
}

export function createAuditModule(deps: ModuleDeps): AuditModule {
  const repository = new AuditRepository(deps.prisma);
  const service = new AuditServiceImpl(repository);
  const controller = new AuditController(service);
  return { service, router: createAuditRouter(controller) };
}

export type { AuditService };
