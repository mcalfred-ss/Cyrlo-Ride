import { Router } from 'express';

import type { ModuleDeps } from '../../common/types/module-deps.js';
import { AdminController } from './module.controller.js';
import { AdminRepository } from './module.repository.js';
import { createAdminRouter } from './module.routes.js';
import { AdminServiceImpl, type AdminService } from './module.service.js';

export interface AdminModule {
  service: AdminService;
  router: Router;
}

export function createAdminModule(deps: ModuleDeps): AdminModule {
  const repository = new AdminRepository(deps.prisma);
  const service = new AdminServiceImpl(repository);
  const controller = new AdminController(service);
  return { service, router: createAdminRouter(controller) };
}

export type { AdminService };
