import { Router } from 'express';

import type { ModuleDeps } from '../../common/types/module-deps.js';
import type { AuditService } from '../audit/module.service.js';
import { UsersController } from './module.controller.js';
import { UsersRepository } from './module.repository.js';
import { createUsersRouter } from './module.routes.js';
import { UsersServiceImpl, type UsersService } from './module.service.js';

export interface UsersModule {
  service: UsersService;
  router: Router;
}

export function createUsersModule(deps: ModuleDeps & { audit?: AuditService }): UsersModule {
  const repository = new UsersRepository(deps.prisma);
  const service = new UsersServiceImpl(repository, { audit: deps.audit });
  const controller = new UsersController(service);
  return { service, router: createUsersRouter(controller) };
}

export type { UsersService };
