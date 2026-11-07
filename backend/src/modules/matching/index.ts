import { Router } from 'express';

import type { ModuleDeps } from '../../common/types/module-deps.js';
import type { AuditService } from '../audit/module.service.js';
import type { BookingsService } from '../bookings/module.service.js';
import type { CandidateOrderingStrategy } from './candidate-ordering.js';
import { MatchingController } from './module.controller.js';
import { MatchingRepository } from './module.repository.js';
import { createMatchingRouter } from './module.routes.js';
import {
  MatchingServiceImpl,
  type MatchingService,
  type MatchingServiceDeps,
} from './module.service.js';

export interface MatchingModule {
  service: MatchingService;
  router: Router;
}

export function createMatchingModule(
  deps: ModuleDeps & { audit: AuditService; bookings: BookingsService },
  options?: {
    ordering?: CandidateOrderingStrategy;
    offerTimeoutSeconds?: number;
    serviceDeps?: Partial<MatchingServiceDeps>;
  },
): MatchingModule {
  const repository = new MatchingRepository(deps.prisma);
  const service = new MatchingServiceImpl(repository, {
    audit: deps.audit,
    prisma: deps.prisma,
    bookings: deps.bookings,
    ordering: options?.ordering,
    offerTimeoutSeconds: options?.offerTimeoutSeconds,
    ...options?.serviceDeps,
  });
  const controller = new MatchingController(service);
  return { service, router: createMatchingRouter(controller) };
}

export type { MatchingService };
