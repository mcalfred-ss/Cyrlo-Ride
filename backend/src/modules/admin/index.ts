import { Router } from 'express';

import type { ModuleDeps } from '../../common/types/module-deps.js';
import { env } from '../../config/env.js';
import {
  createSmsProvider,
  smsOptionsFromEnv,
  type SmsProvider,
} from '../../infrastructure/sms/sms.provider.js';
import type { AuditService } from '../audit/module.service.js';
import { AdminConsoleController } from './console.controller.js';
import { AdminConsoleRepository } from './console.repository.js';
import { AdminConsoleService } from './console.service.js';
import { AdminController } from './module.controller.js';
import { AdminRepository } from './module.repository.js';
import { createAdminRouter } from './module.routes.js';
import { AdminServiceImpl, type AdminService, type AdminServiceDeps } from './module.service.js';

export interface AdminModule {
  service: AdminService;
  consoleService: AdminConsoleService;
  router: Router;
}

export function createAdminModule(
  deps: ModuleDeps & { audit: AuditService },
  options?: { sms?: SmsProvider; serviceDeps?: Partial<AdminServiceDeps> },
): AdminModule {
  const repository = new AdminRepository(deps.prisma);
  const sms = options?.sms ?? createSmsProvider(smsOptionsFromEnv(env));
  const service = new AdminServiceImpl(repository, {
    sms,
    audit: deps.audit,
    prisma: deps.prisma,
    ...options?.serviceDeps,
  });
  const controller = new AdminController(service);
  const consoleService = new AdminConsoleService(new AdminConsoleRepository(deps.prisma), {
    now: options?.serviceDeps?.now,
  });
  const consoleController = new AdminConsoleController(consoleService);
  return {
    service,
    consoleService,
    router: createAdminRouter(controller, consoleController),
  };
}

export type { AdminService };
