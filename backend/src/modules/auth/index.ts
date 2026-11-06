import { Router } from 'express';

import type { ModuleDeps } from '../../common/types/module-deps.js';
import { AuthController } from './module.controller.js';
import { AuthRepository } from './module.repository.js';
import { createAuthRouter } from './module.routes.js';
import { AuthServiceImpl, type AuthService } from './module.service.js';

export interface AuthModule {
  service: AuthService;
  router: Router;
}

export function createAuthModule(deps: ModuleDeps): AuthModule {
  const repository = new AuthRepository(deps.prisma);
  const service = new AuthServiceImpl(repository);
  const controller = new AuthController(service);
  return { service, router: createAuthRouter(controller) };
}

export type { AuthService };
