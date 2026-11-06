import { Router } from 'express';

import type { ModuleDeps } from '../../common/types/module-deps.js';
import { PaymentsController } from './module.controller.js';
import { PaymentsRepository } from './module.repository.js';
import { createPaymentsRouter } from './module.routes.js';
import { PaymentsServiceImpl, type PaymentsService } from './module.service.js';

export interface PaymentsModule {
  service: PaymentsService;
  router: Router;
}

export function createPaymentsModule(deps: ModuleDeps): PaymentsModule {
  const repository = new PaymentsRepository(deps.prisma);
  const service = new PaymentsServiceImpl(repository);
  const controller = new PaymentsController(service);
  return { service, router: createPaymentsRouter(controller) };
}

export type { PaymentsService };
