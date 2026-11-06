import { Router } from 'express';

import type { ModuleDeps } from '../../common/types/module-deps.js';
import { BookingsController } from './module.controller.js';
import { BookingsRepository } from './module.repository.js';
import { createBookingsRouter } from './module.routes.js';
import { BookingsServiceImpl, type BookingsService } from './module.service.js';

export interface BookingsModule {
  service: BookingsService;
  router: Router;
}

export function createBookingsModule(deps: ModuleDeps): BookingsModule {
  const repository = new BookingsRepository(deps.prisma);
  const service = new BookingsServiceImpl(repository);
  const controller = new BookingsController(service);
  return { service, router: createBookingsRouter(controller) };
}

export type { BookingsService };
