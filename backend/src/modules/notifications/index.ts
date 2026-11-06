import { Router } from 'express';

import type { ModuleDeps } from '../../common/types/module-deps.js';
import { NotificationsController } from './module.controller.js';
import { NotificationsRepository } from './module.repository.js';
import { createNotificationsRouter } from './module.routes.js';
import { NotificationsServiceImpl, type NotificationsService } from './module.service.js';

export interface NotificationsModule {
  service: NotificationsService;
  router: Router;
}

export function createNotificationsModule(deps: ModuleDeps): NotificationsModule {
  const repository = new NotificationsRepository(deps.prisma);
  const service = new NotificationsServiceImpl(repository);
  const controller = new NotificationsController(service);
  return { service, router: createNotificationsRouter(controller) };
}

export type { NotificationsService };
